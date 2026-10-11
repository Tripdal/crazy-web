<?php
// Společné funkce: ukládání dat, cookies, pomocné funkce.

define('ROOT', dirname(__DIR__));
define('DATA_DIR', ROOT . '/data');
define('UPLOAD_DIR', ROOT . '/uploads');
define('UPLOAD_URL', '/uploads/');

const IMAGE_EXT = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
const MAX_MESSAGES_PER_GROUP = 500;

// ---------------------------------------------------------------------------
// Úložiště – JSON soubory ve složce data/.
// Každý soubor začíná řádkem "<?php exit; ?…", takže i když by server
// nerespektoval .htaccess, obsah se v prohlížeči nikdy nezobrazí.
// ---------------------------------------------------------------------------
const GUARD = "<?php exit; ?" . ">\n"; // rozděleno, aby PHP neukončilo blok

function data_path(string $name): string
{
    if (!preg_match('/^[\w-]+$/', $name)) throw new RuntimeException('Neplatný název souboru.');
    return DATA_DIR . '/' . $name . '.php';
}

function decode_store(string $raw, $default)
{
    $json = substr($raw, strlen(GUARD));
    $val = $json === '' ? null : json_decode($json, true);
    return $val ?? $default;
}

function read_store(string $name, $default = [])
{
    $file = data_path($name);
    if (!is_file($file)) return $default;
    $fp = fopen($file, 'r');
    flock($fp, LOCK_SH);
    $raw = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return decode_store($raw, $default);
}

// Načte, upraví a uloží soubor pod zámkem. Callback dostane data referencí.
function update_store(string $name, callable $fn, $default = [])
{
    if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0755, true);
    $fp = fopen(data_path($name), 'c+');
    flock($fp, LOCK_EX);
    $data = decode_store(stream_get_contents($fp), $default);
    $result = $fn($data);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, GUARD . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return $result;
}

function delete_store(string $name): void
{
    @unlink(data_path($name));
}

// ---------------------------------------------------------------------------
// Výchozí obsah webu
// ---------------------------------------------------------------------------
function default_site(): array
{
    return [
        'settings' => [
            'siteName' => 'Crazy Vranovice',
            'tagline' => 'Taneční skupina plná energie, pohybu a radosti',
            'about' => '<p>Jsme taneční skupina z Vranovic. Tancujeme, vystupujeme a hlavně si to užíváme! '
                . 'Přidej se k nám – nezáleží na věku ani zkušenostech, stačí chuť se hýbat.</p>',
            'contactEmail' => '',
            'contactPhone' => '',
            'address' => 'Vranovice',
            'trainingTimes' => '',
            'facebookUrl' => 'https://www.facebook.com/crazyvranovice/',
            'instagramUrl' => '',
            'logo' => '/img/logo.svg',
            'heroImage' => '',
        ],
        'news' => [],
        'groups' => [],
    ];
}

function read_site(): array
{
    $site = read_store('site', default_site());
    $site['settings'] = array_merge(default_site()['settings'], $site['settings'] ?? []);
    return $site;
}

function update_site(callable $fn)
{
    return update_store('site', function (&$site) use ($fn) {
        $site['settings'] = array_merge(default_site()['settings'], $site['settings'] ?? []);
        return $fn($site);
    }, default_site());
}

// ---------------------------------------------------------------------------
// Pomocné funkce
// ---------------------------------------------------------------------------
function new_id(): string
{
    return rtrim(strtr(base64_encode(random_bytes(9)), '+/', '-_'), '=');
}

function now_iso(): string
{
    return gmdate('Y-m-d\TH:i:s.v\Z');
}

function str_in($v, int $max = 10000): string
{
    if (!is_string($v)) return '';
    return mb_substr(trim($v), 0, $max);
}

function json_out($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $status = 400): void
{
    json_out(['error' => $message], $status);
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

function client_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

// ---------------------------------------------------------------------------
// Podepsané cookies (HMAC) – obsah nelze podvrhnout.
// ---------------------------------------------------------------------------
function secret(): string
{
    static $secret = null;
    if ($secret === null) {
        $secret = update_store('secret', function (&$d) {
            if (empty($d['key'])) $d['key'] = bin2hex(random_bytes(32));
            return $d['key'];
        });
    }
    return $secret;
}

function set_signed_cookie(string $name, string $value, int $ttl): void
{
    $sig = hash_hmac('sha256', $name . '|' . $value, secret());
    setcookie($name, $value . '.' . $sig, [
        'expires' => time() + $ttl,
        'path' => '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function get_signed_cookie(string $name): ?string
{
    $raw = $_COOKIE[$name] ?? '';
    $pos = strrpos($raw, '.');
    if ($pos === false) return null;
    $value = substr($raw, 0, $pos);
    $sig = substr($raw, $pos + 1);
    return hash_equals(hash_hmac('sha256', $name . '|' . $value, secret()), $sig) ? $value : null;
}

function clear_cookie(string $name): void
{
    setcookie($name, '', ['expires' => 1, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
}

// Jednoduchý limiter uložený v souboru – brání hádání hesla a spamu.
function rate_limit(string $key, int $windowSec, int $max): bool
{
    return update_store('ratelimit', function (&$d) use ($key, $windowSec, $max) {
        $t = time();
        foreach ($d as $k => $v) if ($v['until'] < $t) unset($d[$k]);
        $entry = $d[$key] ?? ['n' => 0, 'until' => $t + $windowSec];
        $entry['n']++;
        $d[$key] = $entry;
        return $entry['n'] <= $max;
    });
}

// ---------------------------------------------------------------------------
// Obrázky
// ---------------------------------------------------------------------------
function save_image_bytes(string $bytes): ?string
{
    $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
    if (!isset(IMAGE_EXT[$mime])) return null;
    if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0755, true);
    $name = new_id() . '.' . IMAGE_EXT[$mime];
    file_put_contents(UPLOAD_DIR . '/' . $name, $bytes);
    return UPLOAD_URL . $name;
}

// Obrázky vložené do editoru jako base64 (kopírování / přetažení) uloží jako soubory.
function extract_data_images(string $html): string
{
    return preg_replace_callback(
        '/src="data:image\/(?:jpeg|png|gif|webp);base64,([A-Za-z0-9+\/=\s]+)"/',
        function ($m) {
            $url = save_image_bytes(base64_decode($m[1]));
            return $url ? 'src="' . $url . '"' : 'src=""';
        },
        $html
    );
}

function is_upload_url($v): bool
{
    return is_string($v) && preg_match('#^/uploads/[\w-]+\.(jpg|png|gif|webp)$#', $v);
}
