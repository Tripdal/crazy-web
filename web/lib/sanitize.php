<?php
// Čištění HTML z editoru – povolí jen bezpečné značky a atributy.

const SAN_TAGS = [
    'p' => ['style'], 'br' => [], 'h1' => ['style'], 'h2' => ['style'], 'h3' => ['style'], 'h4' => [],
    'strong' => [], 'b' => [], 'em' => [], 'i' => [], 'u' => [], 's' => [], 'sub' => [], 'sup' => [],
    'a' => ['href'], 'ul' => [], 'ol' => [], 'li' => [], 'blockquote' => [], 'pre' => [], 'code' => [],
    'img' => ['src', 'alt', 'width', 'height'], 'span' => ['style'], 'iframe' => ['src'], 'hr' => [],
];
// Značky, jejichž obsah se zahodí celý (ne jen samotná značka).
const SAN_DROP = ['script', 'style', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'template', 'noscript', 'head', 'title', 'meta', 'link'];
const SAN_IFRAME_HOSTS = ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com'];

function sanitize_html(string $html): string
{
    $html = trim($html);
    if ($html === '') return '';
    $doc = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="utf-8"?' . '><div id="__root">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    $root = $doc->getElementById('__root');
    if (!$root) return '';
    san_children($root);
    $out = '';
    foreach ($root->childNodes as $child) $out .= $doc->saveHTML($child);
    return $out;
}

function san_children(DOMNode $node): void
{
    foreach (iterator_to_array($node->childNodes) as $child) {
        if ($child instanceof DOMText) continue;
        if (!($child instanceof DOMElement)) { $node->removeChild($child); continue; }
        $tag = strtolower($child->tagName);
        if (in_array($tag, SAN_DROP, true)) { $node->removeChild($child); continue; }
        if (!isset(SAN_TAGS[$tag])) {
            // Neznámou značku rozbalí – ponechá její text.
            san_children($child);
            while ($child->firstChild) $node->insertBefore($child->firstChild, $child);
            $node->removeChild($child);
            continue;
        }
        san_attributes($child, $tag);
        if ($tag === 'iframe' && !$child->hasAttribute('src')) { $node->removeChild($child); continue; }
        if ($tag === 'img' && !$child->hasAttribute('src')) { $node->removeChild($child); continue; }
        san_children($child);
    }
}

function san_attributes(DOMElement $el, string $tag): void
{
    $allowed = SAN_TAGS[$tag];
    foreach (iterator_to_array($el->attributes) as $attr) {
        $name = strtolower($attr->name);
        $value = trim($attr->value);
        $keep = null;
        if ($name === 'class') {
            $classes = array_filter(preg_split('/\s+/', $value), fn ($c) => preg_match('/^ql-(align|indent|size)-[\w-]+$|^ql-video$/', $c));
            $keep = implode(' ', $classes);
        } elseif (in_array($name, $allowed, true)) {
            $keep = match ($name) {
                'href' => preg_match('#^(https?://|mailto:|tel:|/|\#)#i', $value) ? $value : null,
                'src' => san_src($tag, $value),
                'style' => san_style($value),
                'width', 'height' => preg_match('/^\d{1,4}$/', $value) ? $value : null,
                default => $value,
            };
        }
        $el->removeAttribute($attr->name);
        if ($keep !== null && $keep !== '') $el->setAttribute($name, $keep);
    }
    if ($tag === 'a') {
        $el->setAttribute('target', '_blank');
        $el->setAttribute('rel', 'noopener noreferrer');
    }
    if ($tag === 'iframe') {
        $el->setAttribute('frameborder', '0');
        $el->setAttribute('allowfullscreen', 'true');
    }
}

function san_src(string $tag, string $value): ?string
{
    if ($tag === 'iframe') {
        $host = parse_url($value, PHP_URL_HOST);
        return preg_match('#^https://#i', $value) && in_array($host, SAN_IFRAME_HOSTS, true) ? $value : null;
    }
    return preg_match('#^(https?://|/(?!/))#i', $value) ? $value : null;
}

function san_style(string $value): ?string
{
    $out = [];
    foreach (explode(';', $value) as $decl) {
        [$prop, $val] = array_map('trim', explode(':', $decl, 2) + [1 => '']);
        $prop = strtolower($prop);
        $color = '/^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\))$/i';
        if (($prop === 'color' || $prop === 'background-color') && preg_match($color, $val)) $out[] = "$prop: $val";
        if ($prop === 'text-align' && preg_match('/^(left|right|center|justify)$/', $val)) $out[] = "$prop: $val";
    }
    return $out ? implode('; ', $out) : null;
}

function excerpt_of(string $html, int $len = 180): string
{
    $text = html_entity_decode(strip_tags(preg_replace('/<(br|\/p|\/li|\/h\d)>/i', ' $0', $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = trim(preg_replace('/\s+/u', ' ', str_replace("\u{00A0}", ' ', $text)));
    if (mb_strlen($text) <= $len) return $text;
    return preg_replace('/\s\S*$/u', '', mb_substr($text, 0, $len)) . '…';
}

function first_image(string $html): string
{
    return preg_match('/<img[^>]+src="([^"]+)"/', $html, $m) ? $m[1] : '';
}
