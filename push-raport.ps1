# Raport dla push.bat.
# WAZNE: tylko ASCII. Windows PowerShell 5.1 czyta pliki .ps1 jako ANSI, wiec
# ramki unicode i polskie ogonki rozsypuja sie w parserze. Zadnych znakow
# spoza ASCII w tym pliku.
param(
  [ValidateSet('naglowek','zmiany','historia')]
  [string]$Tryb = 'zmiany'
)

$SZER = 74

function Ramka($tekst, $prawa = '') {
  $lewa = ' ' + $tekst
  $wolne = $SZER - 2 - $lewa.Length - $prawa.Length
  if ($wolne -lt 1) { $wolne = 1 }
  '|' + $lewa + (' ' * $wolne) + $prawa + ' |'
}
function Linia() { '+' + ('-' * ($SZER - 2)) + '+' }

function Kategoria($sciezka) {
  switch -Regex ($sciezka) {
    '^media/tours/'    { 'GRAFIKA'   ; break }
    '^_content/'       { 'TRESC'     ; break }
    '\.(html|css)$'    { 'SZABLON'   ; break }
    '\.js$'            { 'SKRYPT'    ; break }
    '\.(bat|ps1|py)$'  { 'NARZEDZIE' ; break }
    default            { 'INNE' }
  }
}
function Opis-Statusu($s) {
  switch ($s.Substring(0,1)) {
    'A' { 'nowy'      ; break }
    'M' { 'zmieniony' ; break }
    'D' { 'usuniety'  ; break }
    'R' { 'przeniesiony' ; break }
    default { $s }
  }
}

if ($Tryb -eq 'naglowek') {
  $data  = Get-Date -Format 'yyyy-MM-dd HH:mm'
  $galaz = (git rev-parse --abbrev-ref HEAD 2>$null)
  Write-Host ''
  Write-Host (Linia)
  Write-Host (Ramka 'QUESTINI - DEPLOY' $data)
  Write-Host (Ramka ("galaz: " + $galaz))
  Write-Host (Linia)
  exit 0
}

if ($Tryb -eq 'zmiany') {
  $wiersze = @(git diff --cached --name-status)
  if ($wiersze.Count -eq 0) {
    Write-Host ''
    Write-Host '  Brak zmian do wyslania.'
    exit 0
  }
  $poz = @(foreach ($w in $wiersze) {
    $p = $w -split "`t"
    [pscustomobject]@{
      Status = Opis-Statusu $p[0]
      Plik   = $p[-1]
      Grupa  = Kategoria $p[-1]
    }
  })
  Write-Host ''
  Write-Host (Linia)
  Write-Host (Ramka ('ZMIANY: ' + $poz.Count))
  foreach ($g in ($poz | Group-Object Grupa | Sort-Object Name)) {
    Write-Host (Linia)
    Write-Host (Ramka ($g.Name + ' (' + $g.Count + ')'))
    foreach ($x in $g.Group) {
      $plik = $x.Plik
      if ($plik.Length -gt 52) { $plik = '...' + $plik.Substring($plik.Length - 49) }
      Write-Host (Ramka ('  ' + $plik) $x.Status)
    }
  }
  Write-Host (Linia)
  exit 0
}

if ($Tryb -eq 'historia') {
  $sep = [char]0x1F
  Write-Host ''
  Write-Host (Linia)
  Write-Host (Ramka 'OSTATNIE COMMITY')
  Write-Host (Linia)
  $log = @(git log -3 --date=format:'%Y-%m-%d %H:%M' --pretty=format:"%h$sep%ad$sep%s")
  foreach ($w in $log) {
    $p = $w -split $sep
    if ($p.Count -lt 3) { continue }
    $temat = $p[2]
    if ($temat.Length -gt 38) { $temat = $temat.Substring(0, 37) + '...' }
    Write-Host (Ramka ($p[0] + '  ' + $temat) $p[1])
  }
  Write-Host (Linia)
  Write-Host ''
  Write-Host '  Strona zaktualizuje sie w ciagu 1-2 minut.'
  Write-Host ''
  exit 0
}
