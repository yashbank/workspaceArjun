/**
 * MIS translation dictionaries — English and Hindi only.
 *
 * Telugu is explicitly out of scope (S7). Do not add a third locale here
 * without a scope change; the toggle, the print layouts and the exports all
 * assume exactly two.
 *
 * Proper nouns the factory says in English every day — machine names like
 * "Komori 6 Color" — are deliberately NOT translated. They live in master
 * data, not here.
 */

export const LOCALES = ['en', 'hi'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Each locale's name written in its own script, for the toggle. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  hi: 'हिंदी',
};

const en = {
  'app.title': 'Factory MIS',
  'app.loading': 'Loading',

  'nav.masters': 'Masters',
  'nav.orders': 'Orders',
  'nav.production': 'Production',
  'nav.quality': 'Quality',
  'nav.attendance': 'Attendance',
  'nav.reports': 'Reports',
  'nav.settings': 'Settings',
  'nav.machines': 'Machines',
  'nav.more': 'More',

  'role.OWNER': 'Owner',
  'role.ADMIN': 'Admin',
  'role.SUPERVISOR': 'Supervisor',
  'role.QC': 'Quality Check',
  'role.ATTENDANCE_OPERATOR': 'Attendance Operator',
  'role.SUPER_ATTENDANCE_OPERATOR': 'Senior Attendance Operator',
  'role.WORKER': 'Worker',
  'role.none': 'No MIS role',
  'role.select': 'Select a role',

  'action.add': 'Add',
  'action.edit': 'Edit',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.delete': 'Delete',
  'action.restore': 'Restore',
  'action.close': 'Close',
  'action.search': 'Search',
  'action.addOption': '+ Add option',
  'action.retry': 'Try again',

  'common.yes': 'Yes',
  'common.no': 'No',
  'common.active': 'Active',
  'common.inactive': 'Inactive',
  'common.deleted': 'Deleted',
  'common.showDeleted': 'Show deleted',
  'common.nameHi': 'Name (Hindi)',
  'common.unsavedChanges': 'You have unsaved changes. Discard them?',
  'common.confirmDelete': 'Delete this record?',
  'common.signedInAs': 'Signed in as',
  'common.language': 'Language',

  'empty.title': 'Nothing here yet',
  'empty.body': 'Records you add will show up here.',
  'empty.noResults': 'No records match your search.',

  'error.title': 'Something went wrong',
  'error.forbidden.title': 'You do not have access to this',
  'error.forbidden.body':
    'Your role does not allow this screen. If you think that is wrong, ask your supervisor.',
  'error.backHome': 'Back to home',
} as const;

export type TranslationKey = keyof typeof en;

const hi: Record<TranslationKey, string> = {
  'app.title': 'फैक्ट्री एमआईएस',
  'app.loading': 'लोड हो रहा है',

  'nav.masters': 'मास्टर',
  'nav.orders': 'ऑर्डर',
  'nav.production': 'उत्पादन',
  'nav.quality': 'गुणवत्ता',
  'nav.attendance': 'हाज़िरी',
  'nav.reports': 'रिपोर्ट',
  'nav.settings': 'सेटिंग',
  'nav.machines': 'मशीन',
  'nav.more': 'और',

  'role.OWNER': 'मालिक',
  'role.ADMIN': 'एडमिन',
  'role.SUPERVISOR': 'सुपरवाइज़र',
  'role.QC': 'गुणवत्ता जाँच',
  'role.ATTENDANCE_OPERATOR': 'हाज़िरी ऑपरेटर',
  'role.SUPER_ATTENDANCE_OPERATOR': 'वरिष्ठ हाज़िरी ऑपरेटर',
  'role.WORKER': 'कामगार',
  'role.none': 'कोई एमआईएस भूमिका नहीं',
  'role.select': 'भूमिका चुनें',

  'action.add': 'जोड़ें',
  'action.edit': 'बदलें',
  'action.save': 'सेव करें',
  'action.cancel': 'रद्द करें',
  'action.delete': 'हटाएँ',
  'action.restore': 'वापस लाएँ',
  'action.close': 'बंद करें',
  'action.search': 'खोजें',
  'action.addOption': '+ नया विकल्प',
  'action.retry': 'फिर कोशिश करें',

  'common.yes': 'हाँ',
  'common.no': 'नहीं',
  'common.active': 'चालू',
  'common.inactive': 'बंद',
  'common.deleted': 'हटाया गया',
  'common.showDeleted': 'हटाए गए दिखाएँ',
  'common.nameHi': 'नाम (हिंदी)',
  'common.unsavedChanges': 'सेव नहीं हुआ है। बदलाव छोड़ दें?',
  'common.confirmDelete': 'यह रिकॉर्ड हटाएँ?',
  'common.signedInAs': 'साइन इन',
  'common.language': 'भाषा',

  'empty.title': 'अभी कुछ नहीं है',
  'empty.body': 'आप जो रिकॉर्ड जोड़ेंगे वे यहाँ दिखेंगे।',
  'empty.noResults': 'खोज से कोई रिकॉर्ड नहीं मिला।',

  'error.title': 'कुछ गड़बड़ हो गई',
  'error.forbidden.title': 'आपके पास इसकी अनुमति नहीं है',
  'error.forbidden.body':
    'आपकी भूमिका इस स्क्रीन की अनुमति नहीं देती। अगर यह गलत लगे तो अपने सुपरवाइज़र से कहें।',
  'error.backHome': 'होम पर वापस',
};

export const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = {
  en,
  hi,
};
