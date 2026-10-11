# Crazy Vranovice – web taneční skupiny

Jednostránkový web (úvod s logem, aktuality, o nás, kontakt) s vysouvacím chatem
vpravo a jednoduchou administrací.

## Spuštění

```bash
npm install
npm start          # http://localhost:3000
```

Při prvním spuštění se vygeneruje heslo do administrace – vypíše se do konzole
a uloží do `data/INITIAL_ADMIN_PASSWORD.txt`. Heslo lze nastavit i předem
proměnnou `ADMIN_PASSWORD`. Po přihlášení ho změníte v **Administrace → Nastavení**.

Administrace: **http://localhost:3000/admin**

| Proměnná         | Význam                                                        |
| ---------------- | ------------------------------------------------------------- |
| `PORT`           | Port serveru (výchozí 3000)                                   |
| `ADMIN_PASSWORD` | Počáteční heslo administrace (použije se jen při 1. spuštění) |
| `DATA_DIR`       | Složka pro data a nahrané obrázky (výchozí `./data`)          |
| `COOKIE_SECRET`  | Klíč pro podpis cookies (jinak se vygeneruje do `data/`)      |
| `NODE_ENV`       | `production` = cookies jen přes HTTPS                         |

## Administrace

- **Aktuality** – vytvoření, úprava a smazání příspěvků. Editor umí nadpisy,
  tučné písmo, barvy, seznamy, odkazy, videa z YouTube a **obrázky i animované
  GIFy** (tlačítkem, přetažením nebo Ctrl+V). Příspěvek lze uložit jako koncept
  nebo připnout nahoru. Ctrl+S ukládá.
- **Chaty** – přidání, přejmenování a smazání chatovacích skupin; zobrazení
  zpráv (včetně e‑mailů pisatelů), mazání zpráv a odpovídání jménem skupiny.
- **Nastavení** – logo, obrázek na pozadí úvodu, texty, kontakty, odkazy na
  sociální sítě a změna hesla.

## Chat a uložení jména / e‑mailu

Návštěvník zadá jméno a e‑mail (se souhlasem). Údaje se ukládají **na serveru**
(`data/db.json`); prohlížeč dostane jen podepsanou `httpOnly` cookie s ID
uživatele (platnost 1 rok). JavaScript stránky ji nepřečte a nelze ji
podvrhnout. E‑mail vidí pouze administrátor. Zprávy chodí živě (Server‑Sent
Events), v každé skupině se drží posledních 500.

## Nasazení

Je potřeba hosting s Node.js ≥ 18 a **trvalým diskem** pro složku `data/`
(VPS, Railway, Render s diskem, Fly.io s volume apod.). Statický hosting
(GitHub Pages, Netlify) nestačí. Za HTTPS proxy nastavte `NODE_ENV=production`.
Zálohujte složku `data/`.

## Struktura

```
server.js            API, chat, nahrávání obrázků
lib/store.js         ukládání dat do JSON souboru
public/index.html    veřejný web (+ css/site.css, js/site.js)
public/admin/        administrace
public/img/logo.svg  zástupné logo (nahraďte v Nastavení)
```
