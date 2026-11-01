// Obróbka obrazów grafik gry (game-art.mjs) — Python + Pillow (jak w quo-icons/place-icons; na VPS nie ma sharp ani ImageMagick).
// Moduł z kodem Pythona jako napisem, bo deploy kopiuje tylko bin/*.mjs. Uruchamianie: pyRun(job) → { code, out, err }.
// Tryby: png | slice (wycięcie tła + pocięcie siatki) | compose (wyrównane klatki Quo, arkusz, podgląd, GIF) | pano | tiles | props | webp.
// Testy: game-art.test.mjs (syntetyczne obrazy, bez sieci).
import { spawn } from 'node:child_process';

export const PY = String.raw`
import sys, json, os
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageFont, PngImagePlugin
job = json.loads(sys.argv[1])
TITLE = job.get('title') or 'Quo: Wyprawa'
RIGHTS = '© Quolino (quolino.com). All rights reserved.'
DESC = job.get('desc') or ('Grafika gry Quo: Wyprawa: ' + TITLE + '. AI + redakcja Quolino.')

def exif():
    ex = Image.Exif()
    ex[0x013B] = 'Quolino (quolino.com)'
    ex[0x8298] = '(C) Quolino, quolino.com. All rights reserved.'
    ex[0x010E] = ('Quolino: ' + TITLE)[:300]
    ex[0x0131] = 'Quolino media pipeline'
    return ex.tobytes()
def xmp():
    e = lambda s: str(s).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('"','&quot;')
    return ('<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
      '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" '
      'xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">'
      '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + e('Quolino: ' + TITLE) + '</rdf:li></rdf:Alt></dc:title>'
      '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">' + e(DESC) + '</rdf:li></rdf:Alt></dc:description>'
      '<dc:creator><rdf:Seq><rdf:li>Quolino</rdf:li></rdf:Seq></dc:creator>'
      '<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">' + RIGHTS + '</rdf:li></rdf:Alt></dc:rights>'
      '<photoshop:Credit>Quolino (quolino.com)</photoshop:Credit><xmpRights:Marked>True</xmpRights:Marked>'
      '<xmpRights:WebStatement>https://quolino.com</xmpRights:WebStatement>'
      '<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>'
      '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>').encode('utf-8')
def pnginfo():
    pi = PngImagePlugin.PngInfo()
    for k, v in (('Title', 'Quolino: ' + TITLE), ('Author', 'Quolino (quolino.com)'), ('Copyright', RIGHTS), ('Source', 'https://quolino.com'), ('Description', DESC)):
        pi.add_text(k, v)
    return pi
def save_png(im, dst):
    im.save(dst, 'PNG', pnginfo=pnginfo(), exif=exif())

def border_color(rgb):
    w, h = rgb.size; px = rgb.load(); pts = []
    for x in range(0, w, 8): pts += [px[x, 0], px[x, h - 1]]
    for y in range(0, h, 8): pts += [px[0, y], px[w - 1, y]]
    return tuple(sorted(p[i] for p in pts)[len(pts) // 2] for i in range(3))

def cut(im, tol):
    # tło = kolor brzegu (mediana); maska „podobne do tła” (maks. różnica kanałów ≤ tol) połączona z brzegiem → przezroczyste
    im = im.convert('RGBA'); w, h = im.size
    if im.getchannel('A').getextrema()[0] < 250: return im, 'alpha'
    rgb = im.convert('RGB'); bg = border_color(rgb)
    d = ImageChops.difference(rgb, Image.new('RGB', (w, h), bg)).split()
    mx = ImageChops.lighter(ImageChops.lighter(d[0], d[1]), d[2])
    mask = mx.point(lambda v: 255 if v <= tol else 0)
    for x, y in [(x, 0) for x in range(0, w, 8)] + [(x, h - 1) for x in range(0, w, 8)] + [(0, y) for y in range(0, h, 8)] + [(w - 1, y) for y in range(0, h, 8)]:
        if mask.getpixel((x, y)) == 255: ImageDraw.floodfill(mask, (x, y), 128)
    bgm = mask.point(lambda v: 255 if v == 128 else 0)
    alpha = ImageChops.invert(bgm).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = im.copy(); out.putalpha(alpha)
    if bg[1] < min(bg[0], bg[2]) - 60:   # magenta: zdjęcie przebarwienia z krawędzi
        r, g, b, a = out.split()
        rb = ImageChops.darker(r, b); s = ImageChops.subtract(rb, g)
        edge = ImageChops.invert(alpha.filter(ImageFilter.MinFilter(9)).point(lambda v: 255 if v >= 250 else 0))
        s = ImageChops.multiply(s, edge)
        out = Image.merge('RGBA', (ImageChops.subtract(r, s), g, ImageChops.subtract(b, s), a))
    return out, '#%02X%02X%02X' % bg

def strip_shadow(fr):
    # „wypieczony” cień pod stopami: jasne, nienasycone piksele w dolnych 8 % sylwetki → przezroczyste
    box = fr.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if not box: return fr
    y0 = box[3] - max(2, int((box[3] - box[1]) * 0.08))
    px = fr.load(); w, h = fr.size
    for y in range(max(0, y0), min(h, box[3])):
        for x in range(box[0], box[2]):
            r, g, b, a = px[x, y]
            if a and max(r, g, b) - min(r, g, b) < 36 and max(r, g, b) > 140: px[x, y] = (r, g, b, 0)
    return fr

def segs(prof, thr, gap):
    out = []; cur = None; last = -10**9
    for i, v in enumerate(prof):
        if v > thr:
            if cur is not None and i - last <= gap: cur[1] = i
            else:
                cur = [i, i]; out.append(cur)
            last = i
    return out

def occupancy(a):
    w, h = a.size
    rows = [1 if a.crop((0, y, w, y + 1)).getbbox() else 0 for y in range(h)]
    return rows

def cells_by_gaps(a):
    w, h = a.size
    rows = segs(occupancy(a), 0, max(3, h // 60))
    cells = []
    for r0, r1 in rows:
        band = a.crop((0, r0, w, r1 + 1))
        cols = [1 if band.crop((x, 0, x + 1, r1 - r0 + 1)).getbbox() else 0 for x in range(w)]
        for c0, c1 in segs(cols, 0, max(3, w // 80)):
            bb = a.crop((c0, r0, c1 + 1, r1 + 1)).getbbox()
            if bb: cells.append((c0 + bb[0], r0 + bb[1], c0 + bb[2], r0 + bb[3]))
    return cells

def cells_by_grid(a, cols, rows):
    w, h = a.size; cells = []
    for r in range(rows):
        for c in range(cols):
            x0, y0, x1, y1 = c * w // cols, r * h // rows, (c + 1) * w // cols, (r + 1) * h // rows
            bb = a.crop((x0, y0, x1, y1)).getbbox()
            if bb: cells.append((x0 + bb[0], y0 + bb[1], x0 + bb[2], y0 + bb[3]))
    return cells

def drop_debris(cells):
    if not cells: return cells
    areas = sorted((c[2] - c[0]) * (c[3] - c[1]) for c in cells); med = areas[len(areas) // 2]
    return [c for c in cells if (c[2] - c[0]) * (c[3] - c[1]) >= med * 0.18]

def order(cells):
    # czytanie: wiersze z góry (środek pionowy w tym samym pasie), w wierszu od lewej
    cells = sorted(cells, key=lambda c: (c[1] + c[3]) / 2)
    rows = []
    for c in cells:
        cy = (c[1] + c[3]) / 2
        if rows and abs(cy - rows[-1][0]) < (c[3] - c[1]) * 0.5: rows[-1][1].append(c)
        else: rows.append([cy, [c]])
    return [c for _, rc in rows for c in sorted(rc, key=lambda c: c[0])]

def keep_main(fr, keep=0.03):
    # usuwa okruchy po cięciu (kawałek ogona sąsiedniej klatki, kropki): zostają spójne plamy >= keep * największej
    a = fr.getchannel('A').point(lambda v: 255 if v > 24 else 0)
    w, h = a.size; k = max(1, max(w, h) // 300); sw, sh = (w + k - 1) // k, (h + k - 1) // k
    sm = a.resize((sw, sh), Image.NEAREST).load()
    lab = [[0] * sw for _ in range(sh)]; sizes = {}; n = 0
    for y in range(sh):
        for x in range(sw):
            if sm[x, y] and not lab[y][x]:
                n += 1; st = [(x, y)]; lab[y][x] = n; c = 0
                while st:
                    px, py = st.pop(); c += 1
                    for qx, qy in ((px + 1, py), (px - 1, py), (px, py + 1), (px, py - 1)):
                        if 0 <= qx < sw and 0 <= qy < sh and sm[qx, qy] and not lab[qy][qx]: lab[qy][qx] = n; st.append((qx, qy))
                sizes[n] = c
    if n <= 1: return fr, 0
    big = max(sizes.values()); drop = {i for i, c in sizes.items() if c < big * keep}
    if not drop: return fr, 0
    m = Image.new('L', (sw, sh), 255); mp = m.load()
    for y in range(sh):
        for x in range(sw):
            if lab[y][x] in drop: mp[x, y] = 0
    m = m.resize((w, h), Image.NEAREST)
    r, g, b, al = fr.split(); al = ImageChops.multiply(al, m)
    return Image.merge('RGBA', (r, g, b, al)), len(drop)

def facing(fr):
    # 1 = patrzy w prawo: środek górnej części (głowa) na prawo od środka całej sylwetki (ogon ciągnie środek w lewo)
    a = fr.getchannel('A').point(lambda v: 255 if v > 24 else 0); w, h = a.size; px = a.load()
    def cx(y0, y1):
        sx = n = 0
        for y in range(y0, y1, 2):
            for x in range(0, w, 2):
                if px[x, y]: sx += x; n += 1
        return sx / n if n else w / 2
    d = (cx(0, max(1, int(h * 0.35))) - cx(0, h)) / max(1, w)
    return (1 if d >= 0 else -1), round(d, 3)

def measure(fr):
    a = fr.getchannel('A').point(lambda v: 255 if v > 24 else 0); w, h = fr.size
    def cx_of(y0, y1):
        sx = n = 0
        for y in range(y0, y1):
            row = a.crop((0, y, w, y + 1)).getdata()
            for x, v in enumerate(row):
                if v: sx += x; n += 1
        return (sx / n) if n else w / 2
    def cy_of(y0, y1, cx):
        return (y0 + y1) / 2
    feet = cx_of(int(h * 0.75), h)
    hy0, hy1 = 0, max(1, int(h * 0.3))
    head = [round(cx_of(hy0, hy1), 1), round(h * 0.17, 1)]
    return { 'w': w, 'h': h, 'cx': round(feet, 1), 'head': head }

m = job['mode']
if m == 'png':
    Image.open(job['src']).convert('RGBA').save(job['dst'], 'PNG')
elif m == 'slice':
    im = Image.open(job['src']); out, bg = cut(im, int(job.get('tol', 48)))
    a = out.getchannel('A').point(lambda v: 255 if v > 24 else 0)
    expect = int(job.get('expect') or 0); grid = job.get('grid')
    cells = drop_debris(cells_by_gaps(a)); how = 'przerwy'
    if expect and len(cells) != expect and grid:
        g = drop_debris(cells_by_grid(a, grid[0], grid[1]))
        if len(g) == expect: cells, how = g, 'siatka'
    cells = order(cells)
    os.makedirs(job['outDir'], exist_ok=True)
    res = []
    transparent = round(sum(a.histogram()[:13]) / float(a.size[0] * a.size[1]), 3)
    for i, c in enumerate(cells):
        fr = out.crop(c)
        if job.get('shadow'): fr = strip_shadow(fr)
        bb = fr.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox() or (0, 0, fr.size[0], fr.size[1])
        fr = fr.crop(bb)
        dropped = 0; flipped = False; face = None
        if job.get('shadow'):
            fr, dropped = keep_main(fr)
            bb = fr.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
            if bb: fr = fr.crop(bb)
        if job.get('face_right'):
            f, d = facing(fr); face = d
            # JP 2026-11-01: wszystkie klatki patrzą w PRAWO (gra odbija je przy ruchu w lewo) — klatkę odwróconą odbijamy tu, nie w grze
            if f < 0 and d < -0.015: fr = fr.transpose(Image.FLIP_LEFT_RIGHT); flipped = True
        p = os.path.join(job['outDir'], 'cell-%02d.png' % (i + 1)); fr.save(p, 'PNG')
        info = measure(fr) if job.get('measure') else { 'w': fr.size[0], 'h': fr.size[1] }
        info['flipped'] = flipped; info['dropped'] = dropped; info['face'] = face
        info['path'] = p; info['src'] = [c[0] + bb[0], c[1] + bb[1], c[0] + bb[2], c[1] + bb[3]]
        res.append(info)
    print(json.dumps({ 'bg': bg, 'how': how, 'count': len(res), 'transparent': transparent, 'size': list(im.size), 'cells': res }))
elif m == 'compose':
    plan = job['plan']; S = plan['size']; frames = []
    for p, f in zip(job['frames'], plan['frames']):
        fr = Image.open(p).convert('RGBA').resize((max(1, f['w']), max(1, f['h'])), Image.LANCZOS)
        c = Image.new('RGBA', (S, S), (0, 0, 0, 0)); c.alpha_composite(fr, (f['x'], f['y'])); frames.append(c)
    od = job['outDir']; os.makedirs(od, exist_ok=True)
    for i, c in enumerate(frames): c.save(os.path.join(od, 'frame-%02d.png' % (i + 1)), 'PNG')
    sheet = Image.new('RGBA', (S * len(frames), S), (0, 0, 0, 0))
    for i, c in enumerate(frames): sheet.alpha_composite(c, (i * S, 0))
    save_png(sheet, os.path.join(od, 'sheet.png'))
    L = job['layout']; cell = L['cells'][0]['w'] if L['cells'] else 256
    con = Image.new('RGB', (L['W'], L['H']), (250, 246, 238)); d = ImageDraw.Draw(con)
    try: font = ImageFont.load_default(size=18)
    except TypeError: font = ImageFont.load_default()
    for cl, c in zip(L['cells'], frames):
        for yy in range(0, cell, 16):
            for xx in range(0, cell, 16):
                if (xx // 16 + yy // 16) % 2: d.rectangle([cl['x'] + xx, cl['y'] + yy, cl['x'] + xx + 15, cl['y'] + yy + 15], fill=(232, 226, 214))
        sm = c.resize((cell, cell), Image.LANCZOS); con.paste(sm, (cl['x'], cl['y']), sm)
        by = cl['y'] + int(plan['baseline'] * cell / S); d.line([cl['x'], by, cl['x'] + cell, by], fill=(215, 38, 61), width=2)
        d.line([cl['x'] + cell // 2, cl['y'], cl['x'] + cell // 2, cl['y'] + cell], fill=(120, 140, 200), width=1)
        d.text((cl['x'] + 6, cl['ly'] + 4), str(cl['i'] + 1) + (' ' + job['names'][cl['i']] if job.get('names') and cl['i'] < len(job['names']) else ''), fill=(27, 22, 48), font=font)
    con.save(os.path.join(od, 'contact.png'), 'PNG')
    gif = []
    for c in frames:
        bgc = Image.new('RGBA', (S, S), (250, 246, 238, 255)); bgc.alpha_composite(c)
        gif.append(bgc.convert('RGB').resize((S // 2, S // 2), Image.LANCZOS).convert('P', palette=Image.ADAPTIVE))
    gif[0].save(os.path.join(od, 'anim.gif'), save_all=True, append_images=gif[1:], duration=int(job.get('ms', 85)), loop=0, disposal=2)
    print(json.dumps({ 'frames': len(frames) }))
elif m == 'pano':
    im = Image.open(job['src']).convert('RGB'); w, h = im.size; tw, th = job.get('w', 2048), job.get('h', 1152)
    r = tw / th
    if w / h > r: nw = int(h * r); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    elif w / h < r: nh = int(w / r); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    up = im.size[0] < tw
    im = im.resize((tw, th), Image.LANCZOS)
    save_png(im, job['dst'])
    pv = im.resize((1024, int(1024 * th / tw)), Image.LANCZOS); pv.save(job['preview'], 'JPEG', quality=86)
    print(json.dumps({ 'src': [w, h], 'w': tw, 'h': th, 'upscaled': up }))
elif m == 'tiles' or m == 'props':
    od = job['outDir']; os.makedirs(od, exist_ok=True); T = int(job.get('size', 256)); outs = []
    for p, it in zip(job['cells'], job['items']):
        fr = Image.open(p).convert('RGBA'); fit = (job.get('fit') or {}).get(it, 'pad')
        if m == 'tiles' and fit == 'fill':
            t = fr.resize((T, T), Image.LANCZOS)
        elif m == 'tiles' and fit == 'top':
            nh = max(1, min(T, round(fr.size[1] * T / fr.size[0])))
            t = Image.new('RGBA', (T, T), (0, 0, 0, 0)); t.alpha_composite(fr.resize((T, nh), Image.LANCZOS), (0, 0))
        else:   # props: kwadrat z marginesem, przedmiot stoi na dole
            side = int(max(fr.size) * 1.08); sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
            sq.alpha_composite(fr, ((side - fr.size[0]) // 2, side - fr.size[1] - int(side * 0.02))); t = sq.resize((T, T), Image.LANCZOS)
        if it in (job.get('seamless') or []):
            # bezszwowo w poziomie: przesunięcie o pół kafla i przenikanie przy krawędziach (lewa krawędź = ciąg dalszy prawej)
            t2 = ImageChops.offset(t, T // 2, 0)
            mask = Image.new('L', (T, 1))
            mask.putdata([int(255 * min(1.0, min(x, T - 1 - x) / (T / 4.0))) for x in range(T)])
            t = Image.composite(t, t2, mask.resize((T, T)))
        dst = os.path.join(od, it + '.png'); save_png(t, dst); outs.append(dst)
    n = len(outs); cols = min(3, n); cell = 200; gap = 12; rows = (n + cols - 1) // cols
    con = Image.new('RGB', (cols * (cell * 2 + gap) + gap, rows * (cell + 30 + gap) + gap), (250, 246, 238)); d = ImageDraw.Draw(con)
    try: font = ImageFont.load_default(size=18)
    except TypeError: font = ImageFont.load_default()
    for i, (p, it) in enumerate(zip(outs, job['items'])):
        t = Image.open(p).convert('RGBA'); x = gap + (i % cols) * (cell * 2 + gap); y = gap + (i // cols) * (cell + 30 + gap)
        for yy in range(0, cell, 20):
            for xx in range(0, cell * 2, 20):
                if (xx // 20 + yy // 20) % 2: d.rectangle([x + xx, y + yy, x + xx + 19, y + yy + 19], fill=(232, 226, 214))
        sm = t.resize((cell, cell), Image.LANCZOS)
        con.paste(sm, (x, y), sm)
        if m == 'tiles' and it in (job.get('seamless') or []): con.paste(sm, (x + cell, y), sm)   # dwa obok siebie: widać szew
        d.text((x + 4, y + cell + 6), str(i + 1) + ' ' + it, fill=(27, 22, 48), font=font)
    con.save(os.path.join(od, 'contact.png'), 'PNG')
    print(json.dumps({ 'items': job['items'], 'files': outs }))
elif m == 'webp':
    im = Image.open(job['src']).convert('RGBA' if job.get('alpha', True) else 'RGB'); outs = []
    for s in job['sizes']:
        if job.get('by') == 'height': size = (max(1, round(im.size[0] * s / im.size[1])), s)
        elif job.get('by') == 'width': size = (s, max(1, round(im.size[1] * s / im.size[0])))
        else: size = (s, s)
        dst = job['base'] + '-' + str(s) + '.webp'
        im.resize(size, Image.LANCZOS).save(dst, 'WEBP', quality=int(job.get('q', 90)), method=6, exif=exif(), xmp=xmp()); outs.append(dst)
    print(json.dumps({ 'files': outs }))
`;

export function pyRun(job, { timeout = 300_000, python = 'python3' } = {}) {
  return new Promise((resolve) => {
    const p = spawn(python, ['-c', PY, JSON.stringify(job)]);
    let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGTERM'); err += '\n[przekroczony czas]'; }, timeout);
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('error', (e) => { clearTimeout(t); resolve({ code: 127, out, err: e.message }); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}
export const lastJson = (s) => { const l = String(s ?? '').trim().split('\n').pop(); try { return JSON.parse(l); } catch { return null; } };
