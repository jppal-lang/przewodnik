# Raport dla push.bat — tabelki, ktorych cmd.exe sam nie narysuje.
# Wywolanie: powershell -NoProfile -ExecutionPolicy Bypass -File push-raport.ps1 -Tryb zmiany|historia
param(
  [ValidateSet('naglowek','zmiany','historia')]
  [string]$Tryb = 'zmiany',
  [string]$Opis = ''
)

$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8
$SZER = 74

function Ramka($tekst, $prawa = '') {
  $lewa = " $tekst"
  $wolne = $SZER - 2 - $lewa.Length - $prawa.Length
  if ($wolne -lt 1) { $wolne = 1 }
  '│' + $lewa + (' ' * $wolne) + $prawa + ' │'
}
function Linia($znak = '─') { '├' + ($znak * ($SZER - 2)) + '┤' }
function Gora() { '┌' + ('─' * ($SZER - 2)) + '┐' }
function Dol()  { '└' + ('─' * ($SZER - 2)) + '┘' }

function Kategoria($sciezka) {
  switch -Regex ($sciezka) {
    '^media/tours/'      { 'grafika' ; break }
    '^_content/'         { 'treść'   ; break }
    '\.(html|css)$'      { 'szablon' ; break }
    '\.js$'              { 'skrypt'  ; break }
    '\.(bat|ps1|py)$'    { 'narzędzie'; break }
    default              { 'inne' }
  }
}
function Opis-Statusu($s) {
  switch ($s.Substring(0,1)) {
    'A' { 'nowy'     ; break }
    'M' { 'zmieniony'; break }
    'D' { 'usunięty' ; break }
    'R' { 'przeniesiony'; break }
    default { $s }
  }
}

if ($Tryb -eq 'naglowek') {
  $data = Get-Date -Format 'yyyy-MM-dd HH:mm'
  $galaz = (git rev-parse --abbrev-ref HEAD 2>$null)
  Write-Host ''
  Write-Host (Gora)
  Write-Host (Ramka 'QUESTINI · DEPLOY' $data)
  Write-Host (Ramka "gałąź: $galaz")
  Write-Host (Dol)
  exit 0
}

if ($Tryb -eq 'zmiany') {
  $wiersze = @(git diff --cached --name-status)
  if (-not $wiersze -or $wiersze.Count -eq 0) {
    Write-Host ''
    Write-Host '  Brak zmian do wysłania.'
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
  Write-Host (Gora)
  Write-Host (Ramka ("ZMIANY: {0}" -f $poz.Count))
  foreach ($g in ($poz | Group-Object Grupa | Sort-Object Name)) {
    Write-Host (Linia)
    Write-Host (Ramka ("{0} ({1})" -f $g.Name.ToUpper(), $g.Count))
    foreach ($x in $g.Group) {
      $plik = $x.Plik
      if ($plik.Length -gt 52) { $plik = '…' + $plik.Substring($plik.Length - 51) }
      Write-Host (Ramka ("  {0}" -f $plik) $x.Status)
    }
  }
  Write-Host (Dol)
  exit 0
}

if ($Tryb -eq 'historia') {
  Write-Host ''
  Write-Host (Gora)
  Write-Host (Ramka 'OSTATNIE COMMITY')
  Write-Host (Linia)
  $sep = [char]0x1F
  $log = @(git log -3 --date=format:'%Y-%m-%d %H:%M' --pretty=format:"%h%x1F%ad%x1F%s")
  foreach ($w in $log) {
    $p = $w -split $sep
    $temat = $p[2]
    if ($temat.Length -gt 38) { $temat = $temat.Substring(0, 37) + '…' }
    Write-Host (Ramka ("{0}  {1}" -f $p[0], $temat) $p[1])
  }
  Write-Host (Dol)
  Write-Host ''
  Write-Host '  Strona zaktualizuje się w ciągu 1–2 minut.'
  Write-Host ''
  exit 0
}
