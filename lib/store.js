// Jednoduché úložiště v JSON souboru (data/db.json).
// Data drží v paměti a na disk je zapisuje atomicky (temp soubor + rename).
const fs = require('fs');
const path = require('path');

const DEFAULT_DB = {
  settings: {
    siteName: 'Crazy Vranovice',
    tagline: 'Taneční skupina plná energie, pohybu a radosti',
    about:
      '<p>Jsme taneční skupina z Vranovic. Tancujeme, vystupujeme a hlavně si to užíváme! ' +
      'Přidej se k nám – nezáleží na věku ani zkušenostech, stačí chuť se hýbat.</p>',
    contactEmail: '',
    contactPhone: '',
    address: 'Vranovice',
    trainingTimes: '',
    facebookUrl: 'https://www.facebook.com/crazyvranovice/',
    instagramUrl: '',
    logo: '/img/logo.svg',
    heroImage: '',
  },
  news: [],
  groups: [],
  messages: {},
  users: {},
  admin: { passwordHash: null },
};

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    fs.mkdirSync(dir, { recursive: true });
    this.data = this.load();
    this.timer = null;
  }

  load() {
    if (!fs.existsSync(this.file)) return structuredClone(DEFAULT_DB);
    const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    // Doplní klíče přidané v novějších verzích.
    return {
      ...structuredClone(DEFAULT_DB),
      ...raw,
      settings: { ...DEFAULT_DB.settings, ...raw.settings },
      admin: { ...DEFAULT_DB.admin, ...raw.admin },
    };
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    clearTimeout(this.timer);
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store };
