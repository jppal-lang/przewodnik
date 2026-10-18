# LOGOWANIE.md — logowanie przez Google i e-mail (link w wiadomości)

> **Decyzja JP 2026-10-17 (wieczór): Google + e-mail z linkiem.** Rejestracja i logowanie e-mailem bez hasła: wpisujesz adres →
> dostajesz wiadomość z linkiem → kliknięcie **tworzy konto (przy pierwszym razie) i od razu loguje**, przekierowanie na `/konto.html`.
> Link jest jednorazowy i ważny 1 godzinę. Zastępuje wariant „6-cyfrowy kod”. Apple — później, tylko konfiguracją.
> Wymaga dostawcy wysyłki e-maili w UE (SMTP) i rekordów DNS nadawcy (SPF, DKIM) — §5. Adres nadawcy `no-reply@quolino.com`
> służy tylko do wysyłki; nie publikujemy go jako kontaktu (kontakt nadal wyłącznie przez formularz).
> Ikona konta na pasku strony prowadzi do `/konto.html`; po wdrożeniu logowania pokaże stan „zalogowany”.

Decyzja JP 2026-10-17: logowanie **Google, Apple i e-mail** na stronie od razu; e-mail **dwuetapowo**. Zmienia to `DOSTEP-I-KONTA.md` §4,
gdzie Apple było odłożone do aplikacji, a na stronie miało być e-mail i hasło. Haseł nie przechowujemy.

## 1. Jak to działa

```
zaloguj.html: [Zaloguj przez Google]  [E-mail → link w wiadomości]   (później: [Apple])
   → auth.quolino.com (Supabase Auth / GoTrue na naszym VPS) → Google albo Apple → powrót na /konto.html
   → przeglądarka dostaje sesję (JWT, 1 h + odświeżanie) → PostgREST rozpoznaje konto (auth.uid()) → RLS na tabelach konta
```

- **Supabase Auth (GoTrue)** jako osobny kontener obok PostgREST. Obsługuje Google, Apple i logowanie e-mailem kodem jednorazowym.
  Podpisuje JWT tym samym sekretem co PostgREST, więc baza od razu wie, kto pyta.
- **E-mail bez hasła (link):** wpisujesz e-mail → wiadomość z linkiem (jednorazowy, ważny 1 h; limit wysyłek na adres i IP) →
  kliknięcie tworzy konto przy pierwszym razie i od razu loguje (GoTrue: magic link, `shouldCreateUser: true`, powrót na
  `/konto.html`). Działa na urządzeniu, na którym klikniesz link. Nie ma hasła, więc nie ma czego wykraść ani resetować.
  Wymaga dostawcy e-maili transakcyjnych z serwerami w UE (SMTP) — §5.
- **Zakresy:** Google tylko `openid email`, Apple tylko `email`. Bez imienia, nazwiska i zdjęcia.
  Akceptujemy ukryty adres Apple (`…@privaterelay.appleid.com`).
- **Jedno konto, kilka sposobów logowania:** to samo potwierdzone konto e-mail z Google i Apple łączy się w jedno konto.
- **Dane konta:** `auth.users` (e-mail, identyfikator dostawcy, daty). Nasze tabele (album, zakupy, kody) mają `account_id`
  i RLS „tylko swoje wiersze”. Ksywki i awatary dzieci dalej tylko w telefonie.
- **Sesja w przeglądarce:** token w pamięci strony + token odświeżania w `localStorage` (`qc.session`), krótkie życie tokenu,
  rotacja odświeżania. Wylogowanie unieważnia sesję po stronie serwera.
- **Usunięcie konta:** jeden przycisk w konto.html (Prywatność) → usuwa konto i wszystkie wiersze z `account_id`.

## 2. Co musi zrobić JP (tylko on ma te konta)

### Google (bezpłatnie, ok. 10 minut)
1. https://console.cloud.google.com → nowy projekt „Quolino”.
2. „Ekran zgody OAuth” → Zewnętrzny → nazwa „Quolino”, e-mail wsparcia, logo, domena `quolino.com`,
   polityka prywatności `https://quolino.com/cookie-policy.html`. Zakresy: tylko `openid` i `email`.
3. „Dane logowania” → Utwórz → Identyfikator klienta OAuth → Aplikacja internetowa.
   Autoryzowany URI przekierowania: `https://auth.quolino.com/auth/v1/callback`.
4. Skopiuj **Client ID** i **Client secret** — wpiszesz je komendą z §3, nie na czacie.

### Apple (płatne: Apple Developer Program 99 USD rocznie)
1. Członkostwo w Apple Developer Program. Jeśli na firmę, to potrzebny jest numer D-U-N-S, a weryfikacja trwa kilka dni.
2. Certificates, Identifiers & Profiles:
   - App ID z włączonym „Sign in with Apple”;
   - Services ID, np. `com.quolino.web`, z domeną `quolino.com` i adresem powrotu
     `https://auth.quolino.com/auth/v1/callback`;
   - klucz (Key) z „Sign in with Apple” do pobrania jako plik `.p8`. Zapisz też Key ID i Team ID.
3. Plik `.p8` wgrywasz na serwer komendą z §3. Nigdy nie wysyłaj go na Discord ani do czatu.

## 3. Konsola (root) — gotowe komendy dostarcza Hermes

Hermes przygotowuje skrypt `ops/auth-setup.sh`, który pyta o sekrety bez wyświetlania (`read -s`) i zapisuje je do `.env`.
JP dostaje dokładnie: `deploy.sh approve <hash>`, `sh /root/quolino-web/ops/auth-setup.sh`, `docker compose … up -d`.
Bez ręcznej edycji plików.

## 4. Kolejność

1. Hermes: kontener GoTrue (`auth.quolino.com`), SQL (schemat `auth`, role, RLS dla tabel konta), skrypt `auth-setup.sh`.
2. JP: Google (§2) → `auth-setup.sh` → test logowania Google.
3. Claude: `zaloguj.html` (Google), sesja w `konto.html`, wylogowanie, usunięcie konta, klucz `qc.session` w polityce.
4. Później (decyzja JP): Apple (§2) i e-mail z kodem (dostawca e-maili, §5) — tylko konfiguracja.
5. Po działającym logowaniu: pełne wycieczki dla zalogowanych zamiast klucza testera (etap A → B).

## 5. Do decyzji / prawne

- Dostawca e-maili transakcyjnych w UE (np. Brevo, Mailjet) — konto zakłada JP, dane SMTP wpisuje komendą z §3.
- Polityka prywatności: Google, Apple i dostawca e-maili jako podmioty przetwarzające, `qc.session`, retencja kont.
- Administrator danych: JDG czy spółka (`DOSTEP-I-KONTA.md` §7) — przed publicznym startem logowania.

## 6. Stan wdrożenia — etap 1: e-mail z linkiem (2026-10-17)

- **DNS (OVH):** `auth` A → 187.127.76.206. Brevo: `brevo-code` (TXT @), DKIM `brevo1._domainkey` i `brevo2._domainkey` (CNAME),
  DMARC `_dmarc` (TXT, `p=none`). Domena uwierzytelniona w Brevo, nadawca „Quolino <no-reply@quolino.com>” zweryfikowany.
- **SMTP:** `/root/quolino-web/secrets/smtp.env` (JP wpisał klucz przez `read -s`; logowanie do Brevo sprawdzone: 250).
- **Serwer kont:** `ops/auth-compose.yml` (projekt `quolino-auth`, GoTrue v2.197.0), `ops/auth-init.sh` — sekret JWT i hasło
  bazy generuje skrypt (`.env`), rola `supabase_auth_admin` + schemat `auth` w bazie `quolino`, rola `postgres` bez logowania
  (wymagana przez migracje GoTrue; nasz superużytkownik ma inną nazwę). Migracje sprawdzone na bazie testowej 2026-10-17.
- **Adresy:** `https://auth.quolino.com/auth/v1/…` (Traefik obcina prefiks). Zamknięte z zewnątrz: `/signup`, `/recover`, `/admin`.
- **Strona:** `zaloguj.html` (e-mail → link), `auth.js` (sesja `qc.session`, ikona konta: zalogowany → `/konto.html`,
  niezalogowany → `/zaloguj.html`), szablon wiadomości `auth-mail/link.html` (PL + krótko EN), pasek stanu w `konto.html`.
- **Przepływ:** implicit — link z e-maila działa na każdym urządzeniu (telefon, komputer). Wygasły link → `zaloguj.html` z komunikatem.
- **Jeszcze nie:** PostgREST nie zna sekretu JWT (konto nie ma jeszcze tabel w bazie), usunięcie konta (wymaga funkcji po stronie
  serwera), tłumaczenia stron logowania (na razie PL, jak `konto.html`), Google (klient OAuth — JP), polityka prywatności (Brevo, `qc.session`).

## 7. Zmiana 2026-10-18 (JP): rejestracja z hasłem, logowanie hasłem, ochrona przed botami

- **Najpierw rejestracja, potem logowanie.** `zaloguj.html`: zakładki „Zaloguj się” / „Załóż konto” (`#rejestracja`).
  Rejestracja: e-mail + hasło (min. 10 znaków) + „Nie jestem robotem” → e-mail „Potwierdź konto” (`auth-mail/confirm.html`)
  → kliknięcie aktywuje konto i loguje (powrót na `/konto.html`). Logowanie: e-mail + hasło. „Nie pamiętasz hasła?” →
  e-mail „Nowe hasło” (`auth-mail/reset.html`) → `zaloguj.html` z formularzem nowego hasła.
- **Po wysłaniu** formularz znika; zostaje komunikat „Sprawdź skrzynkę” i „Wyślij ponownie” po 60 s.
- **Boty:** `POST /signup` i `/recover` idą przez bramkę `gate/auth-gate.mjs` (kontener `auth-gate` w `ops/auth-compose.yml`):
  ALTCHA z naszej bazy (te same wyzwania co formularz kontaktowy), ukryte pole, minimalny czas wypełnienia, limity na skrót IP
  (5 udanych na godzinę, 30 prób dziennie) i 300 rejestracji dziennie łącznie — `sql/2026-10-18-auth-gate.sql` (`public.auth_gate_check`).
  Zamknięte z zewnątrz: `/otp`, `/magiclink` (konto bez hasła omijałoby bramkę), `/invite`, `/admin`.
- **Konto po zalogowaniu** to prawdziwy widok: bez „podglądu na przykładowych danych”; pusty album pokazuje miasta „do zdobycia”.
  Przykładowe dane tylko dla niezalogowanych (albo `?demo=1`).
- Konto JP założone 17.10 linkiem nie ma hasła — ustawia je przez „Nie pamiętasz hasła?”.
- Do decyzji JP: usuwanie nieaktywnych kont (propozycja w rozmowie 2026-10-18).
