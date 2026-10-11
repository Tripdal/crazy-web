# Crazy Vranovice – web taneční skupiny

Jednostránkový web (úvod s logem, aktuality, o nás, kontakt) s vysouvacím chatem
vpravo a jednoduchou administrací. Běží na **obyčejném PHP hostingu**, i na tom
zdarma. Databázi nepotřebuje, vše se ukládá do souborů.

**Požadavky:** PHP 8.0 nebo novější (běžně dostupné rozšíření `fileinfo` a `dom`).

---

## Nahrání na hosting zdarma (krok za krokem)

Návod je psaný pro **Endora.cz**, ale stejně to funguje u jakéhokoli PHP hostingu.

1. **Založte si hosting.** Na [endora.cz](https://www.endora.cz) si zaregistrujte
   bezplatný webhosting a zvolte si adresu, např. `crazyvranovice.4fan.cz`.
   Pokud jde v administraci hostingu vybrat verzi PHP, nastavte **8.1 nebo vyšší**.
2. **Stáhněte si soubory webu.** Na GitHubu klikněte na **Code → Download ZIP**
   a ZIP rozbalte.
3. **Nahrajte obsah složky `web/`.** Do hostingu se připojte přes FTP
   (např. program [FileZilla](https://filezilla-project.org), přihlašovací údaje
   najdete v administraci hostingu) nebo přes WebFTP v prohlížeči. Nahrajte
   **obsah** složky `web/` (ne složku samotnou) do kořenové složky webu, tedy tam,
   kde má být `index.html`. Nezapomeňte i na skryté soubory `.htaccess`
   (ve FileZille: *Server → Vynutit zobrazení skrytých souborů*).
4. **Povolte zápis.** Složky `data` a `uploads` musí mít právo zápisu.
   Většinou to funguje samo. Kdyby ukládání hlásilo chybu, nastavte jim
   ve FileZille práva **755** (pravé tlačítko → *Atributy souboru*).
5. **Nastavte heslo.** Hned po nahrání otevřete `https://vase-adresa/admin/`.
   Web vás přivítá a požádá o zvolení hesla do administrace.
   Udělejte to hned: heslo si nastaví ten, kdo administraci otevře první.
6. **Hotovo!** V administraci v záložce **Nastavení** nahrajte logo skupiny
   (např. stažené z Facebooku), doplňte kontakty a v záložce **Chaty** vytvořte
   první skupiny.

> Web musí běžet přímo na adrese domény (např. `crazyvranovice.4fan.cz/`),
> ne v podsložce (`neco.cz/crazy/`).

### Zálohy

Veškerý obsah je ve složkách **`data/`** (texty, aktuality, chat, heslo) a
**`uploads/`** (obrázky). Občas si je přes FTP stáhněte do počítače. Hostingy
zdarma žádné zálohy nezaručují.

### Zapomenuté heslo

Přes FTP smažte soubor `data/admin.php` a otevřete `/admin/`. Web vás vyzve
k nastavení nového hesla. Ostatní obsah zůstane zachovaný.

### Nová verze webu

Nahrajte znovu obsah složky `web/` a soubory přepište. Složky `data/` a
`uploads/` při tom **nemažte**, je v nich váš obsah.

---

## Administrace (`/admin/`)

- **Aktuality:** vytvoření, úprava a smazání příspěvků. Editor umí nadpisy,
  tučné písmo, barvy, seznamy, odkazy, videa z YouTube a **obrázky i animované
  GIFy** (tlačítkem, přetažením nebo Ctrl+V). Příspěvek lze uložit jako koncept
  nebo připnout nahoru. Ctrl+S ukládá.
- **Chaty:** přidání, přejmenování a smazání chatovacích skupin. Zobrazí zprávy
  (včetně e‑mailů pisatelů), umí mazat zprávy a odpovídat jménem skupiny.
- **Nastavení:** logo, obrázek na pozadí úvodu, texty, kontakty, odkazy na
  sociální sítě a změna hesla.

## Chat a uložení jména / e‑mailu

Návštěvník zadá jméno a e‑mail (se souhlasem). Údaje se ukládají **na serveru**
(`data/users.php`). Prohlížeč dostane jen podepsanou `httpOnly` cookie s ID
uživatele (platnost 1 rok), kterou stránka nepřečte a nelze ji podvrhnout.
E‑mail vidí pouze administrátor. Nové zprávy se načítají každé ~3 sekundy,
když je chat otevřený. V každé skupině se drží posledních 500 zpráv.

## Bezpečnost

- Datové soubory začínají `<?php exit; ?>` a složky `data/` a `lib/` jsou
  zablokované přes `.htaccess`, takže jejich obsah nejde otevřít z prohlížeče.
- HTML z editoru se na serveru čistí (povolené jsou jen bezpečné značky).
- Nahrávat lze jen obrázky JPG, PNG, GIF a WEBP. Typ se ověřuje podle obsahu
  souboru, ne podle názvu.
- Přihlášení je chráněné proti hádání hesla a všechny změny proti CSRF.

## Vyzkoušení na vlastním počítači

```bash
php -S localhost:8000 -t web
```

Pak otevřete http://localhost:8000 a http://localhost:8000/admin/.

## Struktura

```
web/
  index.html         veřejný web (+ css/site.css, js/site.js)
  api.php            veškerá logika serveru (aktuality, chat, nastavení)
  lib/               pomocné PHP soubory (úložiště, čištění HTML)
  admin/             administrace
  vendor/quill/      textový editor (Quill, licence BSD-3)
  img/logo.svg       zástupné logo (nahraďte v Nastavení)
  data/              obsah webu – vytvoří se sám, nemazat!
  uploads/           nahrané obrázky – nemazat!
```
