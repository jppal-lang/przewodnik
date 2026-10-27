// Ikony miejsc (JP 2026-10-27): które trasy przerabia kolejka (cron „queue”) i ręczne poprawki doboru zdjęć.
// Moduł .mjs, bo deploy kopiuje tylko skrypty. Zasady: docs/IKONY-MIEJSC.md.
// trips: kolejka bierze tylko trasy z OPUBLIKOWANĄ wersją nowego procesu (content.workflow = 'v2'); force: true = także starsza opublikowana.
// stops['<trasa>/<stop_key>']: commonsCategory (bez „Category:”), search (fraza do wyszukiwarki Commons), view ('exterior' | 'interior'),
//   files: ['File:….jpg', 'File:….jpg'] (dwa zdjęcia wybrane ręcznie — bez wyboru przez Claude), skip: true (bez ikony).
export default {
  trips: [
    { slug: 'spello', force: true },     // JP 2026-10-27: generować przed zatwierdzeniem nowej wersji trasy
    { slug: 'frasassi', force: true },
  ],
  max: 3,            // przystanków na jedno uruchomienie kolejki
  maxPending: 6,     // tyle ikon może czekać na ocenę JP — więcej kolejka nie generuje (nie palimy limitu na zapas)
  candidates: 12,    // ile miniatur ogląda Claude przy wyborze 2 zdjęć
  stops: {
    // 'spello/villa-dei-mosaici': { view: 'interior' },
  },
};
