import { useEffect } from 'react';
import store from '@/redux/store';
import { Provider } from 'react-redux';
import ReactModal from 'react-modal';
import '../styles/index.scss';
import '@/styles/chatbot.scss';
import i18n from '@/i18n';
import KeycloakProvider from '@/components/providers/keycloak-provider';
import ThemeApplicator from '@/components/providers/theme-applicator';
import AnnouncementBarContainer from '@/components/cms/AnnouncementBarContainer';
if (typeof window !== 'undefined') {
  require('bootstrap/dist/js/bootstrap');
}

if (typeof window !== 'undefined') {
  ReactModal.setAppElement('body');
}

const SUPPORTED_LANGS = ['en', 'vi'];

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // Detect real language after hydration to avoid SSR mismatch.
    // i18n starts with "en" on both server and client; we switch here.
    const saved = localStorage.getItem('i18nextLng');
    const browser = navigator.language?.split('-')[0];
    const lang = SUPPORTED_LANGS.includes(saved)
      ? saved
      : SUPPORTED_LANGS.includes(browser)
        ? browser
        : 'en';
    if (lang !== i18n.language) {
      i18n.changeLanguage(lang);
      localStorage.setItem('i18nextLng', lang);
    }
  }, []);

  return (
    <Provider store={store}>
      <KeycloakProvider>
        <ThemeApplicator />
        <AnnouncementBarContainer />
        <div id="root">
          <Component {...pageProps} />
        </div>
      </KeycloakProvider>
    </Provider>
  );
}
