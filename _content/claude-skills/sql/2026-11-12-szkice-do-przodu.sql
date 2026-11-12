-- JP 2026-11-12: „za mało produkujemy tras, powinienem mieć 3 szkice do przodu gotowe”.
-- Ustawienie drafts_ahead (panel → Ustawienia); używa go bin/drafts-ahead.mjs (cron co godzinę).
CREATE OR REPLACE FUNCTION admin.settings_list() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_temp AS $f$
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', d.name, 'label', d.label, 'help', d.help, 'kind', d.kind, 'def', d.def,
           'value', coalesce(s.value, d.def), 'updated_at', s.updated_at) ORDER BY d.ord), '[]')
    FROM (VALUES
      (1, 'ai_budget_month_usd', 'Miesięczny budżet płatnych modeli (USD)', 'Po przekroczeniu panel prosi o zgodę na kolejne płatne zadania.', 'num', '10'),
      (2, 'ai_alert_day_usd', 'Alarm dziennych kosztów (USD)', 'Strażnik kosztów zgłasza dzień droższy niż ta kwota.', 'num', '1'),
      (3, 'watch_enabled', 'Strażnicy treści', 'Codzienne sprawdzanie cen, godzin, linków i zamknięć.', 'onoff', 'on'),
      (4, 'watch_ai', 'Strażnicy: pomoc AI', 'AI czyta strony przy cenach i sezonie (w dziennym limicie płatnych modeli).', 'onoff', 'on'),
      (5, 'watch_ai_max_per_run', 'Strażnicy: najwyżej zapytań AI na przebieg', '0 = bez AI.', 'int', '6'),
      (6, 'watch_max_minutes', 'Strażnicy: najdłuższy przebieg (min)', 'Po tym czasie strażnik kończy i wraca w następnym przebiegu.', 'int', '5'),
      (7, 'ticket_sla_hours', 'Tickety: alarm po (godz.)', 'Nowy albo „w toku” ticket bez odpowiedzi dłużej niż tyle godzin jest oznaczony jako spóźniony.', 'int', '24'),
      (8, 'signup_reminder_hours', 'Przypomnienie o potwierdzeniu konta po (godz.)', 'Jeden drugi mail; konto bez potwierdzenia znika po 48 h.', 'int', '20'),
      (9, 'campaign_daily_max', 'Wiadomości: najwyżej maili dziennie', 'Limit dostawcy poczty (Brevo, plan darmowy: 300/dzień łącznie z logowaniem).', 'int', '200'),
      (10, 'treasure_from', 'Skarb Quo wydaje kupony od', 'Data startu płatności (kupony z gry).', 'date', '2027-06-01 00:00:00+02'),
      (11, 'drafts_ahead', 'Szkice tras do przodu', 'Ile tras ma być w drodze (szkice do przejrzenia + w pisaniu). Brakujące system sam bierze z planu tras co godzinę. 0 = wyłączone. Szkice pisze Antigravity z abonamentu (0 $).', 'int', '3')
    ) d(ord, name, label, help, kind, def)
    LEFT JOIN ops.app_settings s ON s.name = d.name;
$f$;
