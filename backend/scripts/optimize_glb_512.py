import os
import subprocess
import json
import struct

def optimize_glb(input_glb, output_glb, max_size=512):
    with open(input_glb, 'rb') as f:
        magic = f.read(4)
        ver = int.from_bytes(f.read(4), 'little')
        tot_len = int.from_bytes(f.read(4), 'little')
        chunk0_len = int.from_bytes(f.read(4), 'little')
        chunk0_type = f.read(4)
        gltf = json.loads(f.read(chunk0_len).decode('utf-8'))
        chunk1_len = int.from_bytes(f.read(4), 'little')
        chunk1_type = f.read(4)
        bin_data = bytearray(f.read(chunk1_len))

    tmp_dir = 'backend/scratch_textures'
    os.makedirs(tmp_dir, exist_ok=True)

    # Trích xuất và nén các texture về max_size (512x512)
    img_bv_indices = set()
    for i, img in enumerate(gltf['images']):
        bv_idx = img['bufferView']
        img_bv_indices.add(bv_idx)
        bv = gltf['bufferViews'][bv_idx]
        offset = bv.get('byteOffset', 0)
        length = bv['byteLength']
        raw_img = bin_data[offset:offset+length]

        raw_path = os.path.join(tmp_dir, f'img_{i}.png')
        with open(raw_path, 'wb') as img_f:
            img_f.write(raw_img)

        # Dùng sips hạ xuống 512x512
        subprocess.run(['sips', '-Z', str(max_size), raw_path], check=True, stdout=subprocess.DEVNULL)

    # Tái tạo bin chunk với các ảnh đã tối ưu
    # Lưu giữ tất cả bufferViews không phải ảnh trước
    non_img_bvs = []
    for idx, bv in enumerate(gltf['bufferViews']):
        if idx not in img_bv_indices:
            non_img_bvs.append(idx)

    new_bin = bytearray()
    new_bvs = [None] * len(gltf['bufferViews'])

    for idx in range(len(gltf['bufferViews'])):
        if idx not in img_bv_indices:
            bv = gltf['bufferViews'][idx]
            offset = bv.get('byteOffset', 0)
            length = bv['byteLength']
            data = bin_data[offset:offset+length]

            # 4-byte align
            while len(new_bin) % 4 != 0:
                new_bin.append(0)

            new_offset = len(new_bin)
            new_bin.extend(data)

            new_bv = dict(bv)
            new_bv['byteOffset'] = new_offset
            new_bvs[idx] = new_bv

    # Thêm các ảnh 512x512 vào cuối
    for i, img in enumerate(gltf['images']):
        raw_path = os.path.join(tmp_dir, f'img_{i}.png')
        with open(raw_path, 'rb') as img_f:
            opt_data = img_f.read()

        while len(new_bin) % 4 != 0:
            new_bin.append(0)

        new_offset = len(new_bin)
        new_bin.extend(opt_data)

        bv_idx = img['bufferView']
        old_bv = gltf['bufferViews'][bv_idx]
        new_bv = {
            'buffer': 0,
            'byteOffset': new_offset,
            'byteLength': len(opt_data)
        }
        new_bvs[bv_idx] = new_bv
        print(f"Image {i}: old {old_bv['byteLength']} -> new {len(opt_data)} bytes")

    gltf['bufferViews'] = new_bvs
    gltf['buffers'][0]['byteLength'] = len(new_bin)

    # Encode JSON
    new_json_bytes = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    while len(new_json_bytes) % 4 != 0:
        new_json_bytes += b' '

    while len(new_bin) % 4 != 0:
        new_bin.append(0)

    total_length = 12 + 8 + len(new_json_bytes) + 8 + len(new_bin)

    with open(output_glb, 'wb') as out_f:
        out_f.write(b'glTF')
        out_f.write(struct.pack('<I', 2))
        out_f.write(struct.pack('<I', total_length))

        out_f.write(struct.pack('<I', len(new_json_bytes)))
        out_f.write(b'JSON')
        out_f.write(new_json_bytes)

        out_f.write(struct.pack('<I', len(new_bin)))
        out_f.write(b'BIN\x00')
        out_f.write(new_bin)

    print(f"Hoàn thành: {output_glb}, dung lượng mới: {os.path.getsize(output_glb)} bytes")

if __name__ == '__main__':
    optimize_glb('frontend/src/assets/characters/talking.glb', 'frontend/src/assets/characters/talking.glb', max_size=512)

