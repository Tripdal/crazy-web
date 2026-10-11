<?php
// API webu Crazy Vranovice. Volá se jako api.php?r=<akce>.
// Všechny změny jdou přes POST (některé free hostingy blokují PUT/DELETE).

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/sanitize.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
mb_internal_encoding('UTF-8');

set_exception_handler(function ($e) {
    error_log('[crazy] ' . $e);
    json_out(['error' => 'Chyba serveru.'], 500);
});

$route = $_GET['r'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

$body = [];
if ($method === 'POST') {
    // Ochrana proti CSRF: cizí stránka nemůže poslat vlastní hlavičku bez CORS.
    if (($_SERVER['HTTP_X_CV'] ?? '') !== '1') fail('Neplatný požadavek.', 403);
    if (str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
        $body = json_decode(file_get_contents('php://input'), true) ?: [];
    }
}

// ---------------------------------------------------------------------------
// Administrátor
// ---------------------------------------------------------------------------
const ADMIN_COOKIE = 'cv_admin';
const ADMIN_TTL = 7 * 24 * 3600;

function admin_hash(): ?string
{
    return read_store('admin', [])['passwordHash'] ?? null;
}

function login_admin(string $hash): void
{
    set_signed_cookie(ADMIN_COOKIE, 'admin:' . (time() + ADMIN_TTL) . ':' . substr(hash('sha256', $hash), 0, 12), ADMIN_TTL);
}

function is_admin(): bool
{
    $v = get_signed_cookie(ADMIN_COOKIE);
    $hash = admin_hash();
    if (!$v || !$hash) return false;
    [$tag, $exp, $ver] = explode(':', $v) + ['', 0, ''];
    // "ver" zneplatní staré přihlášení po změně hesla.
    return $tag === 'admin' && (int) $exp > time() && hash_equals(substr(hash('sha256', $hash), 0, 12), $ver);
}

function require_admin(): void
{
    if (!is_admin()) fail('Nejste přihlášeni.', 401);
}

// ---------------------------------------------------------------------------
// Uživatel chatu – jméno a e‑mail jsou uložené na serveru (data/users.php),
// prohlížeč má jen podepsanou httpOnly cookie s ID.
// ---------------------------------------------------------------------------
const USER_COOKIE = 'cv_user';
const USER_TTL = 365 * 24 * 3600;

function chat_user(): ?array
{
    $id = get_signed_cookie(USER_COOKIE);
    if (!$id) return null;
    return read_store('users', [])[$id] ?? null;
}

function require_user(): array
{
    $u = chat_user();
    if (!$u) fail('Nejdřív zadejte jméno a e‑mail.', 401);
    return $u;
}

// ---------------------------------------------------------------------------
// Pomocné převody
// ---------------------------------------------------------------------------
function public_news(array $n): array
{
    return [
        'id' => $n['id'],
        'title' => $n['title'],
        'content' => $n['content'],
        'excerpt' => excerpt_of($n['content']),
        'image' => $n['cover'] ?: first_image($n['content']),
        'pinned' => !empty($n['pinned']),
        'createdAt' => $n['createdAt'],
        'updatedAt' => $n['updatedAt'],
    ];
}

function admin_news(array $n): array
{
    return public_news($n) + ['cover' => $n['cover'] ?? '', 'published' => !empty($n['published'])];
}

function sorted_news(array $list): array
{
    usort($list, fn ($a, $b) => (!empty($b['pinned']) <=> !empty($a['pinned'])) ?: strcmp($b['createdAt'], $a['createdAt']));
    return $list;
}

function find_group(string $id): ?array
{
    foreach (read_site()['groups'] as $g) if ($g['id'] === $id) return $g;
    return null;
}

function messages_of(string $groupId): array
{
    return read_store('msg-' . $groupId, ['seq' => 0, 'list' => []]);
}

function public_group(array $g): array
{
    $m = messages_of($g['id']);
    $last = end($m['list']);
    return [
        'id' => $g['id'],
        'name' => $g['name'],
        'description' => $g['description'],
        'messageCount' => count($m['list']),
        'lastMessageAt' => $last ? $last['createdAt'] : null,
    ];
}

function public_message(array $m, ?string $meId): array
{
    return [
        'id' => $m['id'],
        'seq' => $m['seq'],
        'name' => $m['name'],
        'text' => $m['text'],
        'createdAt' => $m['createdAt'],
        'admin' => !empty($m['admin']),
        'mine' => $meId !== null && $m['userId'] === $meId,
    ];
}

function add_message(string $groupId, array $msg): array
{
    return update_store('msg-' . $groupId, function (&$d) use ($msg) {
        $d['seq'] = ($d['seq'] ?? 0) + 1;
        $msg['seq'] = $d['seq'];
        $d['list'][] = $msg;
        if (count($d['list']) > MAX_MESSAGES_PER_GROUP) $d['list'] = array_slice($d['list'], -MAX_MESSAGES_PER_GROUP);
        return $msg;
    }, ['seq' => 0, 'list' => []]);
}

function group_param(array $body): string
{
    $id = (string) ($body['group'] ?? $_GET['group'] ?? '');
    if (!preg_match('/^[\w-]{1,20}$/', $id) || !find_group($id)) fail('Skupina neexistuje.', 404);
    return $id;
}

// ---------------------------------------------------------------------------
// Směrování
// ---------------------------------------------------------------------------
switch ("$method $route") {

    // ----- Veřejná data -----
    case 'GET site':
        $site = read_site();
        json_out([
            'settings' => $site['settings'],
            'news' => array_map('public_news', sorted_news(array_values(array_filter($site['news'], fn ($n) => !empty($n['published']))))),
        ]);

    // ----- Přihlášení administrátora -----
    case 'GET admin/me':
        json_out(['admin' => is_admin(), 'needsSetup' => admin_hash() === null]);

    case 'POST admin/setup':
        // Heslo lze nastavit jen jednou – při prvním otevření administrace.
        $pw = str_in($body['password'] ?? '', 200);
        if (mb_strlen($pw) < 6) fail('Heslo musí mít alespoň 6 znaků.');
        $hash = update_store('admin', function (&$d) use ($pw) {
            if (!empty($d['passwordHash'])) return null;
            return $d['passwordHash'] = password_hash($pw, PASSWORD_DEFAULT);
        });
        if (!$hash) fail('Heslo už je nastavené. Přihlaste se.', 409);
        login_admin($hash);
        json_out(['ok' => true]);

    case 'POST admin/login':
        if (!rate_limit('login:' . client_ip(), 900, 10)) fail('Příliš mnoho pokusů. Zkuste to za 15 minut.', 429);
        $hash = admin_hash();
        if (!$hash || !password_verify(str_in($body['password'] ?? '', 200), $hash)) fail('Špatné heslo.', 401);
        login_admin($hash);
        json_out(['ok' => true]);

    case 'POST admin/logout':
        clear_cookie(ADMIN_COOKIE);
        json_out(['ok' => true]);

    case 'POST admin/password':
        require_admin();
        if (!password_verify(str_in($body['current'] ?? '', 200), admin_hash())) fail('Současné heslo nesouhlasí.');
        $next = str_in($body['next'] ?? '', 200);
        if (mb_strlen($next) < 6) fail('Nové heslo musí mít alespoň 6 znaků.');
        $hash = update_store('admin', fn (&$d) => $d['passwordHash'] = password_hash($next, PASSWORD_DEFAULT));
        login_admin($hash);
        json_out(['ok' => true]);

    // ----- Nahrávání obrázků (včetně GIFů) -----
    case 'POST admin/upload':
        require_admin();
        $f = $_FILES['file'] ?? null;
        if (!$f || $f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) {
            fail('Obrázek je příliš velký. Hosting povoluje max. ' . ini_get('upload_max_filesize') . '.');
        }
        if ($f['error'] !== UPLOAD_ERR_OK) fail('Nahrání selhalo.');
        $url = save_image_bytes(file_get_contents($f['tmp_name']));
        if (!$url) fail('Podporované jsou obrázky JPG, PNG, GIF a WEBP.');
        json_out(['url' => $url]);

    // ----- Aktuality -----
    case 'GET admin/news':
        require_admin();
        json_out(array_map('admin_news', sorted_news(read_site()['news'])));

    case 'POST admin/news/save':
        require_admin();
        $fields = [
            'title' => str_in($body['title'] ?? '', 200) ?: 'Bez názvu',
            'content' => sanitize_html(extract_data_images((string) ($body['content'] ?? ''))),
            'cover' => is_upload_url($body['cover'] ?? '') ? $body['cover'] : '',
            'published' => ($body['published'] ?? true) !== false,
            'pinned' => !empty($body['pinned']),
            'updatedAt' => now_iso(),
        ];
        $id = (string) ($body['id'] ?? '');
        $saved = update_site(function (&$site) use ($id, $fields) {
            foreach ($site['news'] as $i => $n) {
                if ($n['id'] === $id) return $site['news'][$i] = array_merge($n, $fields);
            }
            if ($id !== '') return null;
            $item = ['id' => new_id(), 'createdAt' => now_iso()] + $fields;
            $site['news'][] = $item;
            return $item;
        });
        if (!$saved) fail('Aktualita nenalezena.', 404);
        json_out(admin_news($saved));

    case 'POST admin/news/delete':
        require_admin();
        $id = (string) ($body['id'] ?? '');
        $ok = update_site(function (&$site) use ($id) {
            $before = count($site['news']);
            $site['news'] = array_values(array_filter($site['news'], fn ($n) => $n['id'] !== $id));
            return count($site['news']) < $before;
        });
        if (!$ok) fail('Aktualita nenalezena.', 404);
        json_out(['ok' => true]);

    // ----- Nastavení -----
    case 'POST admin/settings':
        require_admin();
        $url = fn ($v) => preg_match('#^https?://#i', str_in($v)) ? str_in($v, 500) : '';
        $settings = update_site(function (&$site) use ($body, $url) {
            $s = &$site['settings'];
            $s = array_merge($s, [
                'siteName' => str_in($body['siteName'] ?? '', 100) ?: $s['siteName'],
                'tagline' => str_in($body['tagline'] ?? '', 300),
                'about' => sanitize_html(extract_data_images((string) ($body['about'] ?? ''))),
                'contactEmail' => str_in($body['contactEmail'] ?? '', 200),
                'contactPhone' => str_in($body['contactPhone'] ?? '', 50),
                'address' => str_in($body['address'] ?? '', 300),
                'trainingTimes' => str_in($body['trainingTimes'] ?? '', 1000),
                'facebookUrl' => $url($body['facebookUrl'] ?? ''),
                'instagramUrl' => $url($body['instagramUrl'] ?? ''),
                'logo' => is_upload_url($body['logo'] ?? '') ? $body['logo'] : '/img/logo.svg',
                'heroImage' => is_upload_url($body['heroImage'] ?? '') ? $body['heroImage'] : '',
            ]);
            return $s;
        });
        json_out($settings);

    // ----- Chat: návštěvník -----
    case 'GET chat/me':
        $u = chat_user();
        json_out($u ? ['name' => $u['name'], 'email' => $u['email']] : null);

    case 'POST chat/join':
        if (!rate_limit('join:' . client_ip(), 3600, 20)) fail('Příliš mnoho pokusů, zkuste to později.', 429);
        $name = str_in($body['name'] ?? '', 40);
        $email = mb_strtolower(str_in($body['email'] ?? '', 200));
        if (mb_strlen($name) < 2) fail('Zadejte jméno (alespoň 2 znaky).');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Zadejte platný e‑mail.');
        if (empty($body['consent'])) fail('Je potřeba souhlas se zpracováním údajů.');
        $existing = get_signed_cookie(USER_COOKIE);
        $user = update_store('users', function (&$users) use ($existing, $name, $email) {
            $id = ($existing && isset($users[$existing])) ? $existing : new_id();
            $users[$id] = array_merge($users[$id] ?? ['id' => $id, 'createdAt' => now_iso()], ['name' => $name, 'email' => $email, 'lastSeen' => now_iso()]);
            return $users[$id];
        });
        set_signed_cookie(USER_COOKIE, $user['id'], USER_TTL);
        json_out(['name' => $user['name'], 'email' => $user['email']]);

    case 'POST chat/leave':
        clear_cookie(USER_COOKIE);
        json_out(['ok' => true]);

    case 'GET chat/groups':
        json_out(array_map('public_group', read_site()['groups']));

    case 'GET chat/messages':
        // Klient se ptá opakovaně (každé ~3 s) a posílá číslo poslední zprávy,
        // kterou už má. Dostane jen novější zprávy + seznam ID kvůli smazaným.
        $user = require_user();
        $gid = group_param($body);
        $since = (int) ($_GET['since'] ?? 0);
        $list = array_slice(messages_of($gid)['list'], -100);
        $new = array_values(array_filter($list, fn ($m) => $m['seq'] > $since));
        json_out([
            'messages' => array_map(fn ($m) => public_message($m, $user['id']), $new),
            'ids' => array_column($list, 'id'),
        ]);

    case 'POST chat/send':
        $user = require_user();
        $gid = group_param($body);
        if (!rate_limit('msg:' . $user['id'], 60, 20)) fail('Píšete moc rychle, chvilku počkejte.', 429);
        $text = str_in($body['text'] ?? '', 1000);
        if ($text === '') fail('Zpráva je prázdná.');
        $msg = add_message($gid, ['id' => new_id(), 'userId' => $user['id'], 'name' => $user['name'], 'text' => $text, 'createdAt' => now_iso()]);
        json_out(public_message($msg, $user['id']));

    // ----- Chat: administrace -----
    case 'GET admin/groups':
        require_admin();
        json_out(array_map('public_group', read_site()['groups']));

    case 'POST admin/groups/save':
        require_admin();
        $name = str_in($body['name'] ?? '', 60);
        if ($name === '') fail('Zadejte název skupiny.');
        $desc = str_in($body['description'] ?? '', 200);
        $id = (string) ($body['id'] ?? '');
        $group = update_site(function (&$site) use ($id, $name, $desc) {
            foreach ($site['groups'] as $i => $g) {
                if ($g['id'] === $id) return $site['groups'][$i] = array_merge($g, ['name' => $name, 'description' => $desc]);
            }
            if ($id !== '') return null;
            $group = ['id' => new_id(), 'name' => $name, 'description' => $desc, 'createdAt' => now_iso()];
            $site['groups'][] = $group;
            return $group;
        });
        if (!$group) fail('Skupina neexistuje.', 404);
        json_out(public_group($group));

    case 'POST admin/groups/delete':
        require_admin();
        $gid = group_param($body);
        update_site(function (&$site) use ($gid) {
            $site['groups'] = array_values(array_filter($site['groups'], fn ($g) => $g['id'] !== $gid));
        });
        delete_store('msg-' . $gid);
        json_out(['ok' => true]);

    case 'GET admin/messages':
        require_admin();
        $gid = group_param($body);
        $users = read_store('users', []);
        json_out(array_map(fn ($m) => public_message($m, null) + [
            'email' => empty($m['admin']) ? ($users[$m['userId']]['email'] ?? '') : '',
        ], messages_of($gid)['list']));

    case 'POST admin/messages/send':
        require_admin();
        $gid = group_param($body);
        $text = str_in($body['text'] ?? '', 1000);
        if ($text === '') fail('Zpráva je prázdná.');
        $msg = add_message($gid, ['id' => new_id(), 'userId' => 'admin', 'name' => read_site()['settings']['siteName'], 'text' => $text, 'createdAt' => now_iso(), 'admin' => true]);
        json_out(public_message($msg, null));

    case 'POST admin/messages/delete':
        require_admin();
        $gid = group_param($body);
        $mid = (string) ($body['id'] ?? '');
        $ok = update_store('msg-' . $gid, function (&$d) use ($mid) {
            $before = count($d['list']);
            $d['list'] = array_values(array_filter($d['list'], fn ($m) => $m['id'] !== $mid));
            return count($d['list']) < $before;
        }, ['seq' => 0, 'list' => []]);
        if (!$ok) fail('Zpráva nenalezena.', 404);
        json_out(['ok' => true]);

    default:
        fail('Nenalezeno.', 404);
}
