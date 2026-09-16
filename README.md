# Baza TU

Lokalne centrum wiedzy komunikatów towarzystw ubezpieczeniowych.

## Uruchomienie na Windows

W PowerShell / Terminalu:

```powershell
cd C:\Users\huz\Desktop
git clone https://github.com/huzyk/BazaTU.git
cd BazaTU
npm install
npm run dev
```

Następnie otwórz: `http://localhost:8765`

Przy kolejnych zmianach kodu wystarczy w katalogu projektu:

```powershell
git pull
```

Jeśli działa `npm run dev`, Node obserwuje zmiany plików i restartuje serwer automatycznie.

## Dane

Lokalna baza SQLite powstaje jako `data/bazatu.db`. Katalog `data/` jest ignorowany przez Git i nie trafia do repozytorium.

## Założenia

- główna nawigacja: aktualne / kończące się / wszystkie / TU,
- kategorie i tagi,
- globalne wyszukiwanie,
- status oraz okres obowiązywania,
- wiadomość źródłowa może mieć wiele wpisów tematycznych,
- oryginalna treść maila pozostaje źródłem,
- docelowo synchronizacja z dedykowanych folderów pocztowych,
- dane poczty i załączniki pozostają lokalnie.
