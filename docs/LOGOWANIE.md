# LOGOWANIE.md — logowanie przez Google, Apple i e-mail (dwuetapowo)

Decyzja JP 2026-10-17: logowanie **Google, Apple i e-mail** na stronie od razu; e-mail **dwuetapowo**. Zmienia to `DOSTEP-I-KONTA.md` §4,
gdzie Apple było odłożone do aplikacji, a na stronie miało być e-mail i hasło. Haseł nie przechowujemy.

## 1. Jak to działa

```
zaloguj.html: [Zaloguj przez Google] [Zaloguj przez Apple] [Zaloguj e-mailem]
   → auth.quolino.com (Supabase Auth / GoTrue na naszym VPS) → Google albo Apple → powrót na /konto.html
   → przeglądarka dostaje sesję (JWT, 1 h + odświeżanie) → PostgREST rozpoznaje konto (auth.uid()) → RLS na tabelach konta
```

- **Supabase Auth (GoTrue)** jako osobny kontener obok PostgREST. Obsługuje Google, Apple i logowanie e-mailem kodem jednorazowym.
  Podpisuje JWT tym samym sekretem co PostgREST, więc baza od razu wie, kto pyta.
- **E-mail dwuetapowo, bez hasła:** krok 1 — wpisujesz e-mail; krok 2 — wpisujesz 6-cyfrowy kod z wiadomości
  (ważny 10 minut, jednorazowy, limit prób i wysyłek z jednego adresu). Nie ma hasła, więc nie ma czego wykraść ani resetować.
  Wymaga dostawcy e-maili transakcyjnych z serwerami w UE (SMTP) — decyzja JP, §5.
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
2. JP: Google (§2) i dostawca e-maili (§5) → `auth-setup.sh` → test logowania Google i e-mailem.
3. Claude: `zaloguj.html` (Google, Apple, e-mail + kod), sesja w `konto.html`, wylogowanie, usunięcie konta, klucz `qc.session` w polityce.
4. JP: Apple (§2) → `auth-setup.sh` (część Apple) → test logowania Apple.
5. Po działającym logowaniu: pełne wycieczki dla zalogowanych zamiast klucza testera (etap A → B).

## 5. Do decyzji / prawne

- Dostawca e-maili transakcyjnych w UE (np. Brevo, Mailjet) — konto zakłada JP, dane SMTP wpisuje komendą z §3.
- Polityka prywatności: Google, Apple i dostawca e-maili jako podmioty przetwarzające, `qc.session`, retencja kont.
- Administrator danych: JDG czy spółka (`DOSTEP-I-KONTA.md` §7) — przed publicznym startem logowania.
