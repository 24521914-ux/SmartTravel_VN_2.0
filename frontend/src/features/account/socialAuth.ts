declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            ux_mode?: 'popup' | 'redirect';
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (listener?: (notification: {
            isNotDisplayed?: () => boolean;
            isSkippedMoment?: () => boolean;
            isDismissedMoment?: () => boolean;
            getNotDisplayedReason?: () => string;
            getSkippedReason?: () => string;
          }) => void) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
    FB?: {
      init: (params: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { accessToken?: string } | null; status?: string }) => void,
        options?: { scope?: string }
      ) => void;
    };
  }
}

const scriptPromises = new Map<string, Promise<void>>();
let initializedFacebookAppId = '';
let activeGoogleCredentialHandler: ((idToken: string) => void) | null = null;
let initializedGoogleClientId = '';

export function getGoogleClientId(): string {
  return String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
}

export function getFacebookAppId(): string {
  return String(import.meta.env.VITE_FACEBOOK_APP_ID ?? '').trim();
}

export function getLocalhostEquivalentUrl(): string | null {
  if (typeof window === 'undefined') return null;
  if (window.location.hostname !== '127.0.0.1') return null;
  const port = window.location.port ? `:${window.location.port}` : '';
  return `${window.location.protocol}//localhost${port}${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function loadExternalScript(src: string, id: string): Promise<void> {
  const existing = scriptPromises.get(id);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const existingTag = document.getElementById(id) as HTMLScriptElement | null;
    if (existingTag?.dataset.loaded === 'true') {
      resolve();
      return;
    }
    const script = existingTag ?? document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      scriptPromises.delete(id);
      reject(new Error(`Unable to load script ${src}`));
    };
    if (!existingTag) document.head.appendChild(script);
  });
  scriptPromises.set(id, promise);
  return promise;
}

async function ensureGoogleInitialized(clientId: string, onCredential: (idToken: string) => void) {
  if (!window.google?.accounts?.id) {
    await loadExternalScript('https://accounts.google.com/gsi/client', 'google-gsi-client');
  }
  const gis = window.google?.accounts?.id;
  if (!gis) {
    throw new Error('Google Identity Services unavailable');
  }
  activeGoogleCredentialHandler = onCredential;
  if (initializedGoogleClientId !== clientId) {
    gis.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      auto_select: false,
      callback: response => {
        if (response.credential && activeGoogleCredentialHandler) {
          activeGoogleCredentialHandler(response.credential);
        }
      }
    });
    initializedGoogleClientId = clientId;
  }
  return gis;
}

export async function renderGoogleSignInButton(options: {
  clientId: string;
  container: HTMLElement;
  onCredential: (idToken: string) => void;
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  width?: number;
  locale?: string;
}): Promise<void> {
  const gis = await ensureGoogleInitialized(options.clientId, options.onCredential);
  options.container.innerHTML = '';
  gis.renderButton(options.container, {
    type: 'standard',
    theme: options.theme ?? 'outline',
    size: 'large',
    shape: 'pill',
    text: options.text ?? 'continue_with',
    width: options.width ?? 260,
    logo_alignment: 'left',
    locale: options.locale ?? 'vi'
  });
}

export async function startGoogleSignIn(options: {
  clientId: string;
  onCredential: (idToken: string) => void;
  onFallbackRequired?: (renderInto: (container: HTMLElement) => void) => void;
}): Promise<void> {
  const gis = await ensureGoogleInitialized(options.clientId, options.onCredential);
  gis.prompt(notification => {
    if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
      options.onFallbackRequired?.(container => {
        container.innerHTML = '';
        gis.renderButton(container, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 300
        });
      });
    }
  });
}

export async function requestFacebookAccessToken(appId: string): Promise<string> {
  if (!window.FB) {
    await loadExternalScript('https://connect.facebook.net/vi_VN/sdk.js', 'facebook-jssdk');
  }
  const fb = window.FB;
  if (!fb) {
    throw new Error('Facebook SDK unavailable');
  }
  if (initializedFacebookAppId !== appId) {
    fb.init({ appId, cookie: false, xfbml: false, version: 'v21.0' });
    initializedFacebookAppId = appId;
  }
  return new Promise<string>((resolve, reject) => {
    fb.login(
      response => {
        const token = response?.authResponse?.accessToken;
        if (token) {
          resolve(token);
        } else {
          reject(new Error('FACEBOOK_CANCELLED'));
        }
      },
      { scope: 'public_profile,email' }
    );
  });
}
