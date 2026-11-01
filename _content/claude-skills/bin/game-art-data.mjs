// Grafiki gry „Quo: Wyprawa” (zgoda JP 2026-10-31: „miałeś zlecić wykonanie nowych grafik”). Moduł, bo deploy kopiuje tylko skrypty.
// Kolejność paczek = priorytet JP. Prompty po angielsku, styl jak quo-icons-data.mjs (wygląd Quo opisuje obrazek, nie słowa).
// kind: frames (klatki Quo → wyrównany arkusz), panorama (daleki plan), tiles (kafle 256 → 32/64/128), props (drobiazgi).
// bg: tło do wycięcia — 'white' dla Quo (jak ikony Quo), 'magenta' dla kamienia (jasny wapień ginąłby na białym).
// grid: [kolumny, wiersze] siatki na obrazie — krojenie po przerwach między elementami, a gdy liczba się nie zgadza, równo po siatce.
const STYLE = 'Same soft 3D render, warm lighting, materials and colours as the reference images (Quolino illustration style: soft, rounded, friendly family 3D cartoon). No text, no letters, no numbers, no logos, no watermark, no frame borders.';
const QUO = 'Keep the character exactly as in the first reference image (proportions, fur colours, face, his single red neckerchief) — only the pose changes.';
const SIDE = 'Strict side view, camera at the character\'s hip height, the same camera distance, lens, lighting and scale in every frame, the character always facing RIGHT.';

export default {
  maxCalls: 50,            // wszystkie paczki razem, łącznie z poprawkami (state.calls)
  thread: 'grafiki gry',   // wątek w #ikony-miejsc (kategoria „Grafiki”) — odpowiedzi JP czyta game-art.mjs watch
  packs: [
    {
      name: 'quo-run', title: 'Quo — bieg (8 klatek)', kind: 'frames', role: 'run', bg: 'white', grid: [4, 2], expect: 8, aspect: '16:9',
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
      name: 'quo-jump', title: 'Quo — skok (4 klatki)', kind: 'frames', role: 'jump', bg: 'white', grid: [2, 2], expect: 4, aspect: '1:1',
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
