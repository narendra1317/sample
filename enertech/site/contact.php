<?php
/**
 * EnerTech Synergies — contact form handler.
 *
 * Accepts POST from contact.html (AJAX or plain form post), validates input,
 * blocks bots via honeypot + simple per-IP rate limit, and emails the enquiry.
 * Responds with JSON for AJAX requests and a redirect otherwise.
 *
 * Configure the constants below for the live server. PHP's mail() requires a
 * working MTA; for reliable delivery swap send_enquiry() for SMTP (e.g. PHPMailer
 * with Microsoft 365) — see README.md.
 */

declare(strict_types=1);

const RECIPIENT    = 'info@enertechsynergies.com';
const FROM_ADDRESS = 'website@enertechsynergies.com';   // must be a domain mailbox (SPF/DKIM)
const RATE_LIMIT   = 5;                                  // submissions per IP per hour
const RATE_DIR     = __DIR__ . '/../.form-rate';         // outside the web root where possible

header('X-Content-Type-Options: nosniff');
$wantsJson = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');

function respond(bool $ok, string $error = '', int $status = 200): never
{
    global $wantsJson;
    http_response_code($ok ? 200 : $status);
    if ($wantsJson) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => $ok, 'error' => $error]);
    } else {
        header('Location: contact.html' . ($ok ? '?sent=1' : '?error=1'), true, 303);
    }
    exit;
}

function clean(string $key, int $max): string
{
    $v = trim((string)($_POST[$key] ?? ''));
    $v = str_replace(["\r", "\0"], '', $v);
    return mb_substr($v, 0, $max);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    if (!$wantsJson) {               // old /contact.php links land on the contact page
        header('Location: contact.html', true, 301);
        exit;
    }
    respond(false, 'Method not allowed', 405);
}

// Honeypot: real users never fill this hidden field.
if (clean('website', 200) !== '') {
    respond(true); // pretend success so bots learn nothing
}

$name    = clean('name', 120);
$company = clean('company', 160);
$email   = clean('email', 200);
$phone   = clean('phone', 20);
$topic   = clean('topic', 60);
$message = trim(str_replace("\0", '', (string)($_POST['message'] ?? '')));
$message = mb_substr($message, 0, 5000);
$consent = ($_POST['consent'] ?? '') === 'yes';

// Header-injection guard on single-line fields.
foreach ([$name, $company, $email, $phone, $topic] as $field) {
    if (preg_match('/[\n\r]/', $field)) {
        respond(false, 'Invalid input', 400);
    }
}

$errors = [];
if ($name === '') $errors[] = 'name';
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'email';
if (!preg_match('/^[0-9+()\-\s]{7,20}$/', $phone)) $errors[] = 'phone';
if (mb_strlen($message) < 10) $errors[] = 'message';
if (!$consent) $errors[] = 'consent';
if ($errors) {
    respond(false, 'Please check: ' . implode(', ', $errors), 422);
}

// Simple file-based rate limit per IP (hashed — no raw IPs stored).
$ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . date('Y-m-d-H'));
if (!is_dir(RATE_DIR)) @mkdir(RATE_DIR, 0700, true);
$rateFile = RATE_DIR . '/' . $ipHash;
$count = is_file($rateFile) ? (int)file_get_contents($rateFile) : 0;
if ($count >= RATE_LIMIT) {
    respond(false, 'Too many submissions. Please email us directly.', 429);
}
@file_put_contents($rateFile, (string)($count + 1), LOCK_EX);

$subject = 'Website enquiry' . ($topic !== '' ? " – $topic" : '') . " – $name";
$body = "New enquiry from enertechsynergies.com\n\n"
      . "Name:    $name\n"
      . "Company: " . ($company ?: '-') . "\n"
      . "Email:   $email\n"
      . "Phone:   $phone\n"
      . "Topic:   " . ($topic ?: '-') . "\n"
      . "Consent: yes\n"
      . "Sent:    " . gmdate('Y-m-d H:i') . " UTC\n\n"
      . "Message:\n$message\n";

$headers = [
    'From: EnerTech Website <' . FROM_ADDRESS . '>',
    'Reply-To: ' . $name . ' <' . $email . '>',
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: EnerTech-Website',
];

$sent = mail(RECIPIENT, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers));
respond($sent, $sent ? '' : 'Mail could not be sent', 500);
