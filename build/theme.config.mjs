// Theme configuration for mobile webpack builds.
// Reads theme/meta/config.json and provides LESS globalVars and DefinePlugin overrides.
// Kept separate from webpack.config.js to minimise upstream merge conflicts.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// __dirname = web-apps/build/, so '..' reaches web-apps root
const rootDir = path.join(__dirname, '..');

const theme = process.env.THEME || 'euro-office';
const configPath = path.join(rootDir, 'theme', theme, 'meta', 'config.json');

let meta = {};
if (fs.existsSync(configPath)) {
  meta = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Copy theme mobile overrides to a neutral stub path that all editor app.less files import.
// Runs once at module load (before webpack starts). Generates an empty stub when the theme
// has no mobile-overrides.less so the import in app.less always resolves.
const overrideSrc = path.join(rootDir, 'theme', theme, 'assets', 'less', 'overrides', 'mobile-overrides.less');
const overrideDst = path.join(rootDir, 'apps', 'common', 'mobile', 'resources', 'less', '_theme-mobile-overrides.less');
try {
  if (fs.existsSync(overrideSrc)) fs.copyFileSync(overrideSrc, overrideDst);
  else fs.writeFileSync(overrideDst, '// no theme mobile overrides\n');
} catch (e) { console.warn('[theme.config] mobile overrides copy failed:', e.message); }

// Resolve a brand value with priority: env var > config.json > default.
// Empty string in config.json is respected (explicit "hide this"), matching
// build/Gruntfile.js _themVal semantics on the desktop side.
function themeVal(envVal, metaKey, defaultVal) {
  if (envVal != null && envVal !== '') return envVal;
  if (metaKey in meta) return meta[metaKey];
  return defaultVal;
}

/**
 * Returns additional LESS globalVars for theme logo paths.
 * @param {string} env - 'production' or 'development'
 * @param {string} editor - editor name (e.g. 'documenteditor')
 */
export function themeGlobalVars(env, editor) {
  const base = env === 'production'
    ? `../../../${editor}/mobile/resources/img`
    : '../../common/mobile/resources/img';

  return {
    'theme-mobile-logo-light': `${base}/header/${meta.mobile_logo_light || 'logo-ios.svg'}`,
    'theme-mobile-logo-dark': `${base}/header/${meta.mobile_logo_dark || 'logo-android.svg'}`,
    'theme-about-logo-light': `${base}/about/${meta.about_logo_light || 'logo-new.svg'}`,
    'theme-about-logo-dark': `${base}/about/${meta.about_logo_dark || 'logo-new-white.svg'}`,
  };
}

/**
 * Returns string-replace-loader 'multiple' entries for {{TOKEN}} → value substitution.
 * Handles tokens inside string literals that DefinePlugin cannot reach (it only rewrites
 * bare AST identifiers). productVersion is passed in because BUILD_NUMBER is already
 * computed in each webpack config alongside BannerPlugin.
 */
export function themeReplacements(productVersion) {
  function tok(name) { return `\\{\\{${name}\\}\\}`; }
  function tv(envVal, metaKey, def) { return themeVal(envVal, metaKey, def); }
  return [
    { search: tok('PRODUCT_VERSION'),         replace: productVersion,                                                                      flags: 'g' },
    { search: tok('APP_TITLE_TEXT'),           replace: tv(process.env.APP_TITLE_TEXT,           'app_title',               'ONLYOFFICE'),  flags: 'g' },
    { search: tok('COMPANY_NAME'),             replace: tv(process.env.COMPANY_NAME,             'company_name',            'ONLYOFFICE'),  flags: 'g' },
    { search: tok('PUBLISHER_NAME'),           replace: tv(process.env.PUBLISHER_NAME,           'publisher_name',          'Ascensio System SIA'), flags: 'g' },
    { search: tok('PUBLISHER_URL'),            replace: tv(process.env.PUBLISHER_URL,            'publisher_url',           'https://www.onlyoffice.com'), flags: 'g' },
    { search: tok('PUBLISHER_ADDRESS'),        replace: tv(process.env.PUBLISHER_ADDRESS,        'publisher_address',       '20A-12 Ernesta Birznieka-Upisha street, Riga, Latvia, EU, LV-1050'), flags: 'g' },
    { search: tok('PUBLISHER_PHONE'),          replace: tv(process.env.PUBLISHER_PHONE,          'publisher_phone',         '+371 633-99867'), flags: 'g' },
    { search: tok('SUPPORT_EMAIL'),            replace: tv(process.env.SUPPORT_EMAIL,            'support_email',           'support@onlyoffice.com'), flags: 'g' },
    { search: tok('SUPPORT_URL'),              replace: tv(process.env.SUPPORT_URL,              'support_url',             'https://support.onlyoffice.com'), flags: 'g' },
    { search: tok('SALES_EMAIL'),              replace: tv(process.env.SALES_EMAIL,              'sales_email',             'sales@onlyoffice.com'), flags: 'g' },
    { search: tok('ATTRIBUTION'),              replace: tv(process.env.ATTRIBUTION,              'attribution',             ''),            flags: 'g' },
    { search: tok('HELP_URL'),                 replace: tv(process.env.HELP_URL,                 'help_url',                ''),            flags: 'g' },
    { search: tok('HELP_CENTER_WEB_DE'),       replace: tv(process.env.HELP_CENTER_WEB_DE,       'help_center_web_de',      ''),            flags: 'g' },
    { search: tok('HELP_CENTER_WEB_SSE'),      replace: tv(process.env.HELP_CENTER_WEB_SSE,      'help_center_web_sse',     ''),            flags: 'g' },
    { search: tok('HELP_CENTER_WEB_PE'),       replace: tv(process.env.HELP_CENTER_WEB_PE,       'help_center_web_pe',      ''),            flags: 'g' },
    { search: tok('HELP_CENTER_WEB_VE'),       replace: tv(process.env.HELP_CENTER_WEB_VE,       'help_center_web_ve',      ''),            flags: 'g' },
    { search: tok('DEFAULT_LANG'),             replace: tv(process.env.DEFAULT_LANG,             'default_lang',            'en') || 'en', flags: 'g' },
    { search: tok('SUGGEST_URL'),              replace: tv(process.env.SUGGEST_URL,              'suggest_url',             ''),            flags: 'g' },
    { search: tok('API_URL_EDITING_CALLBACK'), replace: tv(process.env.API_URL_EDITING_CALLBACK, 'api_url_editing_callback',''),            flags: 'g' },
  ];
}

/**
 * Returns DefinePlugin brand value overrides.
 * Priority: env var > config.json > stock default. Empty string in config.json
 * is respected (renders nothing / hides the row in guarded views).
 */
export function themeDefines() {
  return {
    __PUBLISHER_ADDRESS__: JSON.stringify(themeVal(process.env.PUBLISHER_ADDRESS, 'publisher_address', '20A-12 Ernesta Birznieka-Upisha street, Riga, Latvia, EU, LV-1050')),
    __SUPPORT_EMAIL__:     JSON.stringify(themeVal(process.env.SUPPORT_EMAIL,     'support_email',     'support@onlyoffice.com')),
    __SUPPORT_URL__:       JSON.stringify(themeVal(process.env.SUPPORT_URL,       'support_url',       'https://support.onlyoffice.com')),
    __PUBLISHER_PHONE__:   JSON.stringify(themeVal(process.env.PUBLISHER_PHONE,   'publisher_phone',   '+371 633-99867')),
    __PUBLISHER_URL__:     JSON.stringify(themeVal(process.env.PUBLISHER_URL,     'publisher_url',     'https://www.onlyoffice.com')),
    __PUBLISHER_NAME__:    JSON.stringify(themeVal(process.env.PUBLISHER_NAME,    'publisher_name',    'Ascensio System SIA')),
    __APP_TITLE_TEXT__:    JSON.stringify(themeVal(process.env.APP_TITLE_TEXT,    'app_title',         'ONLYOFFICE')),
    __COMPANY_NAME__:      JSON.stringify(themeVal(process.env.COMPANY_NAME,      'company_name',      'ONLYOFFICE')),
    __HELP_URL__:          JSON.stringify(themeVal(process.env.HELP_URL,          'help_url',          'https://helpcenter.onlyoffice.com')),
    __SALES_EMAIL__:       JSON.stringify(themeVal(process.env.SALES_EMAIL,       'sales_email',       'sales@onlyoffice.com')),
    __ATTRIBUTION__:       JSON.stringify(themeVal(process.env.ATTRIBUTION,       'attribution',       '')),
  };
}
