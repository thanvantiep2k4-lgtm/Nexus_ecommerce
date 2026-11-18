import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useKeycloak } from '@/components/providers/keycloak-provider';
import keycloak from '@/lib/keycloak';
import Loader from '@/components/loader/loader';
import i18n from '@/i18n';

const LoginPage = () => {
  const router = useRouter();
  const kc = useKeycloak();

  useEffect(() => {
    if (!kc?.initialized) return;

    const rawRedirect = router.query.redirect;
    const safeRedirect =
      typeof rawRedirect === 'string' && rawRedirect.startsWith('/') && !rawRedirect.includes('://')
        ? rawRedirect
        : '/';

    if (keycloak.authenticated) {
      router.push(safeRedirect);
    } else {
      const locale = (i18n.language || 'vi').startsWith('en') ? 'en' : 'vi';
      keycloak.login({
        redirectUri: window.location.origin + safeRedirect,
        locale,
      });
    }
  }, [kc?.initialized, router]);

  return (
    <div className="d-flex align-items-center justify-content-center" style={{ height: '100vh' }}>
      <Loader spinner="fade" loading={true} />
    </div>
  );
};

export default LoginPage;
