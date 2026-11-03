// Grafiki gry „Quo: Wyprawa” (zgoda JP 2026-10-31: „miałeś zlecić wykonanie nowych grafik”). Moduł, bo deploy kopiuje tylko skrypty.
// Kolejność paczek = priorytet JP. Prompty po angielsku, styl jak quo-icons-data.mjs (wygląd Quo opisuje obrazek, nie słowa).
// kind: frames (klatki Quo → wyrównany arkusz), panorama (daleki plan), tiles (kafle 256 → 32/64/128), props (drobiazgi).
// bg: tło do wycięcia — 'white' dla Quo (jak ikony Quo), 'magenta' dla kamienia (jasny wapień ginąłby na białym).
// grid: [kolumny, wiersze] siatki na obrazie — krojenie po przerwach między elementami, a gdy liczba się nie zgadza, równo po siatce.
const STYLE = 'Same soft 3D render, warm lighting, materials and colours as the reference images (Quolino illustration style: soft, rounded, friendly family 3D cartoon). No text, no letters, no numbers, no logos, no watermark, no frame borders.';
const QUO = 'Keep the character exactly as in the first reference image (proportions, fur colours, face, his single red neckerchief) — only the pose changes.';
const SIDE = 'Strict side view, camera at the character\'s hip height, the same camera distance, lens, lighting and scale in every frame, the character always facing RIGHT.';

// ── pozy Quo v2 (gra/art/pozy-quo.json, JP 2026-11-01) ──
const LOOK = 'The golden-orange fur, cream belly and muzzle, big brown eyes, round ears with pink inside, small tuft on the head, big fluffy curled tail and the terracotta neckerchief tied at the back of the neck must match the turnaround reference in every frame.';
// JP 2026-11-01: w starej grze Quo biegł tyłem — każda klatka patrzy w PRAWO, lustro robi gra (skrypt i tak odbija klatki odwrócone)
const FACE_R = 'In every frame his nose points to the RIGHT edge of the image and his tail is on the LEFT side of his body; never draw him facing left (the game mirrors the frames itself when he moves left).';
const BOLD = 'Make every pose very clear and exaggerated, readable as a silhouette even when small; consecutive frames must differ visibly exactly as described.';
const CELLS = 'Each frame shows the whole character, feet and tail included, centred in its own cell with generous empty space around it, at the same scale in every frame; the characters never touch or overlap each other or the cell edges.';
const BG = 'Clean pure white #FFFFFF background everywhere, no ground line, no shadow under the character, no motion lines, no dust, no effects, no labels or numbers.';
const sheet = (n, cols, rows, frames, extra = '') => `${QUO}\nCreate a game sprite sheet of exactly ${n} separate frames arranged in a grid of ${cols} columns and ${rows} rows, read left to right, top row first.` +
  (n < cols * rows ? ` Leave the last ${cols * rows - n === 1 ? 'cell' : cols * rows - n + ' cells'} empty.` : '') + ` ${frames} ${LOOK} ${extra} ${SIDE} ${FACE_R} ${BOLD} ${CELLS} ${BG} ${STYLE}`;
const REFS2 = ['gra/art/ref/quo-bok-ref.webp', 'gra/art/ref/quo-obrot-ref.webp'];
const LAB2 = ['the character, side view facing right (main reference)', 'the same character from 8 angles (turnaround, for shape and colours only)'];
const pz = (o) => ({ kind: 'frames', bg: 'white', aspect: '16:9', refs: REFS2, labels: LAB2, ...o });

export default {
  maxCalls: 50,            // wszystkie paczki razem, łącznie z poprawkami (state.calls)
  thread: 'grafiki gry',   // wątek w #ikony-miejsc (kategoria „Grafiki”) — odpowiedzi JP czyta game-art.mjs watch
  packs: [
    {
      name: 'quo-run', superseded: 'pozy v2 (quo-pozy-*)', title: 'Quo — bieg (8 klatek)', kind: 'frames', role: 'run', bg: 'white', grid: [4, 2], expect: 8, aspect: '16:9',
      refs: ['media/icons/pose-08-running-512.webp', 'media/icons/pose-09-sprint-512.webp', 'media/icons/pose-10-full-speed-512.webp'],
      labels: ['the character (running)', 'the same character sprinting', 'the same character at full speed'],
      frameNames: ['contact', 'down', 'pass', 'up', 'contact2', 'down2', 'pass2', 'up2'],
      hint: 'Podgląd: 8 klatek wyrównanych do linii stóp (czerwona linia) + animacja GIF. W grze cykl przyspiesza z prędkością Quo.',
      prompt: `${QUO}\nCreate a game sprite sheet: ONE complete run cycle to the right in exactly 8 frames, arranged in a grid of 4 columns and 2 rows, read left to right, top row first. ` +
        `Frame 1 contact (front foot touching the ground), 2 down (body lowest, knees bent), 3 passing (legs crossing under the body), 4 up (pushing off, body highest), ` +
        `5–8 the same four phases with the other leg leading, so frame 8 flows smoothly back into frame 1. Tail and ears follow the motion slightly. ` +
        `${SIDE} Each frame shows the whole character, feet included, centred in its own cell with generous empty space around it; the characters never touch or overlap each other or the cell edges. ` +
        `Clean pure white #FFFFFF background everywhere, no ground line, no shadow under the character, no motion lines, no dust. ${STYLE}`
    },
    {
      name: 'quo-jump', superseded: 'pozy v2 (quo-pozy-*)', title: 'Quo — skok (4 klatki)', kind: 'frames', role: 'jump', bg: 'white', grid: [2, 2], expect: 4, aspect: '1:1',
      refs: ['media/icons/pose-07-ready-to-spring-512.webp', 'media/icons/pose-11-leaping-forward-512.webp', 'media/icons/pose-12-high-jump-512.webp'],
      labels: ['the character (ready to spring)', 'the same character leaping forward', 'the same character in a high jump'],
      frameNames: ['takeoff', 'apex', 'fall', 'land'],
      hint: 'Klatki: 1 odbicie, 2 apogeum, 3 opadanie, 4 lądowanie. W grze: wznoszenie → 1, szczyt → 2, spadanie → 3, przykuc po lądowaniu → 4.',
      prompt: `${QUO}\nCreate a game sprite sheet: one jump to the right in exactly 4 frames, arranged in a grid of 2 columns and 2 rows, read left to right, top row first. ` +
        `Frame 1 take-off (legs pushing off, body stretched up and forward), 2 apex (body curled lightly, paws tucked, happy face), 3 falling (body leaning forward and down, feet reaching towards the ground), ` +
        `4 landing (deep crouch, knees bent, paws touching the ground). ${SIDE} Each frame shows the whole character centred in its own cell with generous empty space around it; the characters never touch each other or the cell edges. ` +
        `Clean pure white #FFFFFF background everywhere, no ground line, no shadow, no motion lines, no dust. ${STYLE}`
    },
    {
      // Pozy v2 (gra/art/pozy-quo.json), seria 1: pierwsze 10 klatek pozycji stojących i skoku — JP 2026-11-01 „wygeneruj piersze 10 klatek”.
      name: 'quo-pozy-01', title: 'Quo v2 — pozy 1–10 (stoi, rozgląda się, skok)', kind: 'frames', role: 'pozy01', bg: 'white', grid: [5, 2], expect: 10, aspect: '16:9',
      refs: ['gra/art/ref/quo-bok-ref.webp', 'gra/art/ref/quo-obrot-ref.webp'],
      labels: ['the character, side view facing right (main reference)', 'the same character from 8 angles (turnaround, for shape and colours only)'],
      frameNames: ['idle_1', 'idle_2', 'idle_3', 'idle_look_1', 'idle_look_2', 'jump_start', 'jump_up', 'jump_apex', 'fall_1', 'fall_2'],
      hint: 'Rząd 1: stoi (3 klatki: spokojnie, wdech, mrugnięcie) + rozgląda się (2: głowa do widza, głowa w górę). Rząd 2: odbicie, lot w górę, szczyt skoku, spadanie ×2. Ocena: czy Quo wygląda jak na referencji obrotu (chusta, czubek, ogon) i czy linia stóp się zgadza.',
      prompt: `${QUO}\nCreate a game sprite sheet of exactly 10 separate frames arranged in a grid of 5 columns and 2 rows, read left to right, top row first. ` +
        `Frame 1 standing calmly, paws resting on the belly. Frame 2 the same, a gentle breath in (chest slightly raised). Frame 3 the same as frame 1 but blinking (eyes closed). ` +
        `Frame 4 standing, head turned towards the viewer, curious. Frame 5 standing, looking up, curious. ` +
        `Frame 6 crouched like a spring right before a jump. Frame 7 flying upwards, body stretched up, paws above the head, tail pointing down. ` +
        `Frame 8 top of the jump, curled up, knees under the chin, joyful face. Frame 9 falling, paws up, ears and tail lifted by the air, slightly surprised. Frame 10 the same fall a moment later, paws a little lower. ` +
        `The golden-orange fur, cream belly and muzzle, big brown eyes, round ears with pink inside, small tuft on the head, big fluffy curled tail and the terracotta neckerchief tied at the back of the neck must match the turnaround reference in every frame. ` +
        `${SIDE} Frames 4 and 5 may turn only the head. Each frame shows the whole character, feet and tail included, centred in its own cell with generous empty space around it, at the same scale in every frame; the characters never touch or overlap each other or the cell edges. ` +
        `Clean pure white #FFFFFF background everywhere, no ground line, no shadow under the character, no motion lines, no dust, no labels. ${STYLE}`
    },
    pz({ name: 'quo-pozy-02', role: 'pozy02', faceSkip: [2, 3, 4], faceFlip: [7],   // fikołek: obrót, nie odbijać; 7 (uderzenie) Antigravity rysuje w lewo — odbić title: 'Quo v2 — pozy 11–20 (lądowanie, fikołek, szybowanie, uderzenie, balonik, zbieranie)', grid: [5, 2], expect: 10,
      frameNames: ['land', 'double_jump_1', 'double_jump_2', 'double_jump_3', 'glide_1', 'glide_2', 'hurt', 'balloon_float_1', 'balloon_float_2', 'pickup'],
      hint: 'Rząd 1: lądowanie (przysiad, spłaszczony), fikołek ×3 (zwijanie w kłębek i obrót), szybowanie 1. Rząd 2: szybowanie 2, uderzenie (odrzut do tyłu), balonik ×2, zbieranie (schyla się).',
      prompt: sheet(10, 5, 2, 'Frame 1 landing: knees deeply bent, body squashed a little, paws out to the sides for balance. ' +
        'Frames 2–4 a somersault in the air: 2 tucking into a ball, 3 rolled into a tight ball upside down, 4 unrolling with paws reaching forward. ' +
        'Frames 5–6 gliding through the air: paws spread wide like wings, tail stretched back like a rudder, 6 the same with paws a little higher. ' +
        'Frame 7 hurt: knocked backwards, body leaning back, paws thrown forward, surprised face (no stars, no effects). ' +
        'Frames 8–9 floating in the air holding the string of a single red balloon in his raised front paw, legs dangling; 9 the same with the legs swinging the other way. ' +
        'Frame 10 bending down and reaching to the ground with one front paw to pick something up (nothing on the ground).', 'The red balloon appears only in frames 8 and 9.') }),
    pz({ name: 'quo-pozy-03', role: 'walk', title: 'Quo v2 — chód (8 klatek)', grid: [4, 2], expect: 8,
      frameNames: ['contact', 'down', 'pass', 'up', 'contact2', 'down2', 'pass2', 'up2'],
      hint: 'Pełny cykl chodu w prawo: 1 kontakt, 2 dół, 3 mijanie, 4 góra, 5–8 to samo z drugą nogą. Ocena: czy 8 → 1 płynnie się zapętla i czy idzie przodem w prawo.',
      prompt: sheet(8, 4, 2, 'ONE complete calm walk cycle moving to the RIGHT. Frame 1 contact (front foot touching the ground heel first), 2 down (body lowest, weight on the front leg), 3 passing (back leg swinging past the standing leg), 4 up (body highest), ' +
        '5–8 the same four phases with the other leg leading, so frame 8 flows smoothly back into frame 1. Front paws swing gently opposite to the legs, the tail sways, the neckerchief flutters slightly.') }),
    pz({ name: 'quo-pozy-04', role: 'run', title: 'Quo v2 — bieg (8 klatek)', grid: [4, 2], expect: 8,
      frameNames: ['contact', 'down', 'pass', 'up', 'contact2', 'down2', 'pass2', 'up2'],
      hint: 'Pełny cykl biegu w prawo, pochylony do przodu, uszy do tyłu, ogon wyciągnięty. Ocena: czy biegnie PRZODEM w prawo i czy 8 → 1 się zapętla.',
      prompt: sheet(8, 4, 2, 'ONE complete fast run cycle moving to the RIGHT, body leaning forward, ears swept back, tail stretched out behind. Frame 1 contact (front foot reaching forward and touching the ground), 2 down (body lowest, knee bent), 3 passing (legs crossing under the body), 4 up (pushing off, both feet off the ground, body highest), ' +
        '5–8 the same four phases with the other leg leading, so frame 8 flows smoothly back into frame 1. Front paws pump strongly opposite to the legs.') }),
    pz({ name: 'quo-pozy-05', role: 'pozy05', title: 'Quo v2 — wspinanie (drabina, lina, tyrolka)', grid: [5, 2], expect: 10,
      frameNames: ['climb_ladder_1', 'climb_ladder_2', 'climb_ladder_3', 'climb_ladder_4', 'climb_rope_1', 'climb_rope_2', 'climb_rope_3', 'climb_rope_4', 'zipline_1', 'zipline_2'],
      hint: 'Rząd 1: drabina ×4 (łapki na zmianę), lina 1. Rząd 2: lina 2–4 (łapka nad łapką), tyrolka ×2 (wisi, nogi i ogon się kołyszą). Drabiny, liny i tyrolki NIE ma na grafice — rysuje ją gra.',
      prompt: sheet(10, 5, 2, 'Frames 1–4 climbing UP an invisible vertical ladder that stands right in front of his nose, seen from the side: front paws gripping invisible rungs one above the other and feet on lower rungs, alternating left and right paws in each frame. ' +
        'Frames 5–8 climbing up an invisible vertical rope in front of him, paw over paw, legs wrapped around the rope below, alternating in each frame. ' +
        'Frames 9–10 hanging from an invisible horizontal line above his head with both front paws raised, legs and tail swinging forward in 9 and backward in 10.', 'Do not draw any ladder, rope, line or prop — only the character; the game draws them.') }),
    pz({ name: 'quo-pozy-06', role: 'pozy06', title: 'Quo v2 — zagadki (pchanie, dźwignia, wagonik, skrzynia, myślenie)', grid: [5, 2], expect: 10,
      frameNames: ['push_1', 'push_2', 'push_3', 'push_4', 'lever_1', 'lever_2', 'cart_ride_1', 'cart_ride_2', 'open_chest', 'think'],
      hint: 'Rząd 1: pchanie głazu ×4 (zaparty, krok za krokiem), dźwignia 1. Rząd 2: dźwignia 2 (pociągnięta w dół), wagonik ×2 (siedzi, łapki w górę), skrzynia (podnosi wieko), myśli (łapka pod brodą). Głazu, dźwigni, wagonika i skrzyni NIE ma na grafice.',
      prompt: sheet(10, 5, 2, 'Frames 1–4 pushing a heavy invisible boulder on his right: body leaning far forward, both front paws pressed flat against the invisible boulder, back legs straining, effort on his face; small steps alternating legs in each frame. ' +
        'Frames 5–6 pulling an invisible lever down with both front paws: 5 paws high above his head, 6 paws low at his belly, body bent. ' +
        'Frames 7–8 sitting with the legs tucked under him as if inside a mine cart (cart not drawn), both front paws raised high with joy, 8 the same leaning back a little with an even bigger smile. ' +
        'Frame 9 leaning forward and lifting an invisible chest lid with both front paws, curious face. Frame 10 standing, one front paw under the chin, thinking, eyes looking up.', 'Do not draw any boulder, lever, cart, chest or prop — only the character; the game draws them.') }),
    pz({ name: 'quo-pozy-07', role: 'pozy07', facing: 'any', title: 'Quo v2 — odpoczynek i nagrody (sen, budzenie, foto, brama, radość, skarb)', grid: [5, 2], expect: 9,
      frameNames: ['sleep_1', 'sleep_2', 'wake_1', 'wake_2', 'photo', 'door', 'cheer_1', 'cheer_2', 'treasure'],
      hint: 'Rząd 1: śpi ×2 (zwinięty, ogon jak kocyk), budzi się ×2 (ziewa i przeciąga się, wstaje), foto (aparat przy oku). Rząd 2: brama (od tyłu, krok w głąb), radość ×2 (łapki w górę, podskok), skarb nad głową. Klatka bramy jest od tyłu — skrypt jej nie odbija.',
      prompt: sheet(9, 5, 2, 'Frames 1–2 sleeping curled up in a ball on the ground, eyes closed, the fluffy tail wrapped over him like a blanket; 2 the same with the chest slightly raised (breathing). ' +
        'Frame 3 waking: sitting up, yawning with the mouth wide open and stretching both front paws up. Frame 4 standing up, rubbing one eye with a paw. ' +
        'Frame 5 standing and holding a small camera to his eye with both front paws, taking a photo. ' +
        'Frame 6 seen from behind (three-quarter back view), taking a step forward into the distance, tail and the knot of the neckerchief visible. ' +
        'Frames 7–8 cheering: both front paws up high, 7 standing on tiptoe, 8 jumping up off the ground with feet tucked. ' +
        'Frame 9 standing proudly holding a small shiny golden treasure chest high above his head with both front paws.', 'Only frame 6 is seen from behind; all other frames are side views. The camera appears only in frame 5, the golden chest only in frame 9.') }),
    pz({ name: 'quo-pozy-08', role: 'pozy08', facing: 'any', title: 'Quo v2 — tańce po przystankach 1–3 (machanie, obrót, medal)', grid: [5, 2], expect: 10,
      frameNames: ['dance_wave_1', 'dance_wave_2', 'dance_wave_3', 'dance_wave_4', 'dance_spin_1', 'dance_spin_2', 'dance_spin_3', 'dance_spin_4', 'dance_medal_1', 'dance_medal_2'],
      hint: 'Rząd 1: machanie ×4 (łapki i krok w bok), obrót 1 (przód). Rząd 2: obrót 2–4 (bok, tył, bok — w podskoku), medal ×2 (tupie i kołysze się z medalem). Obrót ma klatki od przodu i od tyłu — skrypt ich nie odbija.',
      prompt: sheet(10, 5, 2, 'A happy dance. Frames 1–4 waving both front paws above the head and stepping to the side, the paws swap height in each frame. ' +
        'Frames 5–8 a jump with a full turn in the air, feet off the ground: 5 seen from the front, 6 from the side facing right, 7 from behind, 8 from the side facing left — this one frame may face left. ' +
        'Frames 9–10 stomping and swaying proudly with a golden medal on a terracotta ribbon hanging on his chest, 9 leaning left with one foot up, 10 leaning right with the other foot up.', 'Frames 1–4 and 9–10 are side views facing right. The medal appears only in frames 9 and 10.') }),
    pz({ name: 'quo-pozy-09', role: 'pozy09', title: 'Quo v2 — taniec disco (4 klatki)', grid: [2, 2], expect: 4, aspect: '1:1',
      frameNames: ['dance_disco_1', 'dance_disco_2', 'dance_disco_3', 'dance_disco_4'],
      hint: 'Disco: łapka w górę po skosie, biodro w bok, na zmianę. 4 klatki w pętli.',
      prompt: sheet(4, 2, 2, 'A disco dance loop: 1 one front paw pointing diagonally up to the sky and the other on the hip, hip pushed to the side; 2 both paws in front of the chest, knees bent; ' +
        '3 the other front paw pointing diagonally up, hip pushed the other way; 4 both paws in front of the chest again, knees bent, so 4 flows back into 1.') }),
    {
      name: 'spello-panorama', title: 'Spello — panorama (daleki plan)', kind: 'panorama', place: 'spello', aspect: '16:9',
      terrains: ['olive', 'gate', 'alley', 'belvedere'],
      refs: ['media/tours/quolino-it-spello-tile-768.webp', 'media/tours/quolino-it-perugia-hero-1200.webp'],
      labels: ['the place and its style (ignore the mascot)', 'the illustration style and golden-hour light (ignore the mascot)'],
      hint: 'Daleki plan dla terenów Spello (gaj oliwny, brama, uliczka, belweder). W grze rozmyty mgiełką za kaflami; dół obrazu chowa się za terenem.',
      prompt: 'Create a wide 16:9 landscape illustration, a distant background for a side-scrolling family game: the medieval hill town of Spello in Umbria seen from afar across the valley at golden hour — ' +
        'pink and white limestone houses climbing the hillside, terracotta roofs, the bell towers, town walls and gates, cypresses and silver-green olive groves on the slopes, Monte Subasio behind, soft warm sky with a few clouds. ' +
        'Panoramic composition with the town in the middle third, calm sky in the top third, and gentle olive-grove hills filling the bottom quarter evenly from edge to edge (the game ground will cover it). ' +
        'Absolutely no characters, no mascot, no people, no animals, no vehicles, no text. Soft painterly depth, slightly hazy distance. Same soft 3D illustration style, colours and golden-hour light as the reference images.'
    },
    {
      name: 'tiles-spello', title: 'Kafle — wapień Spello', kind: 'tiles', set: 'spello', bg: 'magenta', grid: [3, 2], expect: 6, aspect: '3:2',
      terrains: ['olive', 'gate', 'alley', 'belvedere'],
      items: ['top', 'mid', 'left', 'right', 'float', 'crumble'],
      fit: { top: 'fill', mid: 'fill', left: 'fill', right: 'fill', float: 'top', crumble: 'top' },
      seamless: ['top', 'mid', 'float', 'crumble'],
      refs: ['media/tours/quolino-it-spello-tile-768.webp'],
      labels: ['the stone, colours and style of Spello (ignore the mascot)'],
      hint: 'Kafle: 1 ziemia z trawą (wierzch), 2 ziemia/mur (środek), 3 krawędź lewa, 4 krawędź prawa, 5 półka pływająca, 6 kafel kruchy. Wierzch, środek, półka i kruchy są bezszwowe w poziomie.',
      prompt: 'Create a game tile set for a side-scrolling platform game, 6 square tiles arranged in a grid of 3 columns and 2 rows with wide gaps between them, on a perfectly flat solid magenta #FF00FF background. ' +
        'Strict orthographic side view, no perspective, light from the upper left. Material: the warm pink-and-white limestone of Spello (Monte Subasio stone, blocks in soft pink #E6CDBF and cream), earth and green grass. ' +
        'Tile 1 ground top: a square block of stacked limestone blocks and earth with a strip of fresh green grass along the whole top edge, filling the square edge to edge. ' +
        'Tile 2 ground middle: the same stone and earth with no grass, filling the square edge to edge. ' +
        'Tile 3 left edge: like tile 1 but the left side is a finished rounded stone edge. Tile 4 right edge: like tile 1 but the right side is a finished rounded stone edge. ' +
        'Tile 5 floating platform: a thin limestone slab with a little grass on top, as wide as the square, occupying only the upper third of the square. ' +
        'Tile 6 crumbling platform: the same thin slab cracked into pieces with small chips falling, upper third of the square. ' +
        'Tiles 1, 2, 5 and 6 must continue seamlessly when placed side by side horizontally. No shadows on the background, no text. Same soft 3D render and colours as the reference image.'
    },
    {
      name: 'tiles-frasassi', title: 'Kafle — skała Frasassi', kind: 'tiles', set: 'frasassi', bg: 'magenta', grid: [3, 2], expect: 6, aspect: '3:2',
      terrains: ['cave'],
      items: ['top', 'mid', 'left', 'right', 'float', 'crumble'],
      fit: { top: 'fill', mid: 'fill', left: 'fill', right: 'fill', float: 'top', crumble: 'top' },
      seamless: ['top', 'mid', 'float', 'crumble'],
      refs: ['media/tours/quolino-it-frasassi-hero-1200.webp'],
      labels: ['the cave rock, colours and style of Frasassi (ignore the mascot)'],
      hint: 'Kafle jaskini: 1 wierzch (naciek kalcytu), 2 środek, 3 krawędź lewa, 4 krawędź prawa, 5 półka pływająca, 6 kafel kruchy.',
      prompt: 'Create a game tile set for a side-scrolling platform game inside a limestone cave, 6 square tiles arranged in a grid of 3 columns and 2 rows with wide gaps between them, on a perfectly flat solid magenta #FF00FF background. ' +
        'Strict orthographic side view, no perspective, cool light from the upper left. Material: wet cave rock of the Frasassi caves in cool browns with blue-grey and teal highlights, smooth flowstone. ' +
        'Tile 1 ground top: a square block of cave rock with a smooth pale calcite crust and a few tiny glistening drops along the whole top edge, filling the square edge to edge. ' +
        'Tile 2 ground middle: the same rock with no crust, filling the square edge to edge. ' +
        'Tile 3 left edge: like tile 1 but the left side is a rounded rock edge. Tile 4 right edge: like tile 1 but the right side is a rounded rock edge. ' +
        'Tile 5 floating platform: a thin rock ledge with calcite on top, as wide as the square, occupying only the upper third of the square. ' +
        'Tile 6 crumbling ledge: the same thin ledge cracked into pieces with small pebbles falling, upper third of the square. ' +
        'Tiles 1, 2, 5 and 6 must continue seamlessly when placed side by side horizontally. No shadows on the background, no text. Same soft 3D render and colours as the reference image.'
    },
    {
      name: 'props', title: 'Drobiazgi — kwiaty Infioraty, kryształ, woda', kind: 'props', bg: 'magenta', grid: [3, 2], expect: 6, aspect: '3:2',
      items: ['flower-red', 'flower-yellow', 'flower-white', 'crystal', 'drop', 'puddle'],
      refs: ['media/tours/quolino-it-spello-tile-768.webp', 'media/tours/quolino-it-frasassi-hero-1200.webp'],
      labels: ['the style of the Spello illustrations (ignore the mascot)', 'the style of the Frasassi cave (ignore the mascot)'],
      hint: 'Rząd 1: kwiaty Infioraty (czerwony, żółty, biały) na trawie Spello. Rząd 2: kryształ, kropla, kałuża w jaskini Frasassi.',
      prompt: 'Create 6 small separate game props arranged in a grid of 3 columns and 2 rows with wide gaps between them, on a perfectly flat solid magenta #FF00FF background, side view, each prop centred in its cell. ' +
        'Top row, flowers of the Infiorata of Spello: 1 a small clump of red carnations with green leaves, 2 a small clump of yellow broom flowers, 3 a small clump of white daisies. ' +
        'Bottom row, the Frasassi caves: 4 a cluster of three glowing pale-blue calcite crystals, 5 a single clear water drop with a soft highlight, 6 a small shallow cave puddle with a ripple, seen slightly from above. ' +
        'Each prop simple and readable at small size, soft outline. No shadows on the background, no text. Same soft 3D render and colours as the reference images.'
    }
  ]
};
