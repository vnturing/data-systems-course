#!/usr/bin/env python3
"""Independent real-library fixtures for Module 4. No servers or registry required.
python verify.py > results.json
Requires avro==1.12.0 protobuf==6.33.5. Browser codecs are not imported.
"""
import base64
import copy
import csv
import io
import json
import platform
import random

import avro
import avro.io
import avro.schema
import google.protobuf
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory, json_format


def pb_class(extra=False, rename=False):
    fd = descriptor_pb2.FileDescriptorProto(name='account.proto', package='course', syntax='proto3')
    msg = fd.message_type.add(name='Account')
    fields = [(1, 'id', 13), (2, 'email' if rename else 'name', 9)]
    if extra:
        fields.append((3, 'currency', 9))
    for i, (tag, name, kind) in enumerate(fields):
        msg.oneof_decl.add(name='_' + name)
        msg.field.add(name=name, number=tag, type=kind, label=1, proto3_optional=True, oneof_index=i)
    pool = descriptor_pool.DescriptorPool()
    pool.Add(fd)
    return message_factory.GetMessageClass(pool.FindMessageTypeByName('course.Account'))


Old, New, Reused = pb_class(), pb_class(True), pb_class(rename=True)


def fields(msg):
    return {f.name: v for f, v in msg.ListFields()}


def schema(fs, unit='cents', name='Payment'):
    return {'type': 'record', 'name': name, 'fields': copy.deepcopy(fs), 'unit': unit}


def encode(s, r):
    stream = io.BytesIO()
    avro.io.DatumWriter(avro.schema.parse(json.dumps(s))).write(r, avro.io.BinaryEncoder(stream))
    return stream.getvalue()


def decode(w, r, data):
    return avro.io.DatumReader(avro.schema.parse(json.dumps(w)), avro.schema.parse(json.dumps(r))).read(avro.io.BinaryDecoder(io.BytesIO(data)))


base = [{'name': 'id', 'type': 'long'}, {'name': 'amount', 'type': 'int'}]
currency = {'name': 'currency', 'type': 'string', 'default': 'USD'}
no_default = {'name': 'currency', 'type': 'string'}
wide = [{'name': 'id', 'type': 'long'}, {'name': 'amount', 'type': 'long'}]
scenarios = {
    'safe': [schema(base), schema(base + [currency]), schema(base + [currency, {'name': 'note', 'type': 'string', 'default': ''}])],
    'required': [schema(base), schema(base + [no_default]), schema(base + [no_default])],
    'remove': [schema(base), schema([base[0]]), schema([base[0]])],
    'widen': [schema(base), schema(wide), schema(wide)],
    'bridge': [schema(base), schema(base + [currency]), schema(base + [no_default])],
    'units': [schema(base), schema(base, 'dollars'), schema(base, 'dollars')],
}
result = {'environment': {'python': platform.python_version(), 'avro': avro.__version__,
                         'protobuf': google.protobuf.__version__}, 'wire': [], 'matrices': {}, 'dataflow': {}}
account_fields = [{'name': 'id', 'type': 'long'}, {'name': 'name', 'type': 'string'}]
randomizer = random.Random(42)
samples = [(150, 'Zoë'), (0, ''), (127, 'A'), (128, '東京'), (4294967295, '🙂')]
samples += [(randomizer.randrange(2**32), randomizer.choice(['Ada', 'Zoë', '東京', '🙂', 'a b', '<script>'])) for _ in range(30)]
for ident, name in samples:
    for extra in [False, True]:
        record = {'id': ident, 'name': name}
        av = schema(account_fields, name='Account')
        if extra:
            record['currency'] = 'USD'
            av['fields'].append(copy.deepcopy(currency))
        pb = (New if extra else Old)(**record).SerializeToString(deterministic=True)
        binary = encode(av, record)
        assert decode(av, av, binary) == record
        result['wire'].append({'record': record, 'extra': extra, 'protobuf': list(pb), 'avro': list(binary),
                               'json': list(json.dumps(record, ensure_ascii=False, separators=(',', ':')).encode())})
for kind, versions in scenarios.items():
    rows = []
    for w, writer in enumerate(versions, 1):
        data = {'id': 150, 'amount': 12 if writer['unit'] == 'dollars' else 1200, 'currency': 'USD', 'note': 'paid'}
        record = {f['name']: data[f['name']] for f in writer['fields']}
        binary = encode(writer, record)
        for r, reader in enumerate(versions, 1):
            try:
                value = decode(writer, reader, binary)
                rows.append({'writer': w, 'reader': r, 'ok': True, 'value': value, 'bytes': list(binary)})
            except avro.errors.SchemaResolutionException as error:
                rows.append({'writer': w, 'reader': r, 'ok': False, 'error_type': type(error).__name__, 'bytes': list(binary)})
    result['matrices'][kind] = rows
original = New(id=150, name='Zoë', currency='EUR').SerializeToString(deterministic=True)
for mode in ['opaque', 'preserve', 'rebuild', 'json']:
    old = Old.FromString(original)
    if mode == 'opaque':
        outgoing = original
    else:
        old.name = 'Zoe'
        if mode == 'preserve':
            outgoing = old.SerializeToString(deterministic=True)
        elif mode == 'rebuild':
            outgoing = Old(id=old.id, name=old.name).SerializeToString(deterministic=True)
        else:
            outgoing = json_format.Parse(json_format.MessageToJson(old), Old()).SerializeToString(deterministic=True)
    result['dataflow'][mode] = {'bytes': list(outgoing), 'value': fields(New.FromString(outgoing))}
result['reused_tag'] = fields(Reused.FromString(Old(id=150, name='Zoë').SerializeToString()))
try:
    json_format.Parse(json_format.MessageToJson(New(id=150, name='Zoë', currency='EUR')), Old())
    raise AssertionError('Unknown ProtoJSON field unexpectedly accepted')
except json_format.ParseError:
    result['protojson_unknown_field'] = 'rejected by default'
result['text'] = {'python_big_integer': json.loads('{"id":9007199254740993}')['id'],
                  'csv_line': '150,"Doe, Jane","line one\r\nline two"',
                  'base64_zoe': base64.b64encode('Zoë'.encode()).decode()}
result['text']['csv_fields'] = next(csv.reader(io.StringIO(result['text']['csv_line'])))
result['text']['naive_csv_fields'] = result['text']['csv_line'].split(',')
assert result['dataflow']['preserve']['value']['currency'] == 'EUR'
assert 'currency' not in result['dataflow']['rebuild']['value']
assert len(result['text']['csv_fields']) == 3
print(json.dumps(result, indent=2, ensure_ascii=False))
