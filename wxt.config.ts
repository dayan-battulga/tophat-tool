import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Top Hat Audio Alert',
    description:
      'Plays a sound when a Top Hat question or participation prompt appears.',
    permissions: ['storage', 'offscreen'],
    host_permissions: ['https://app.tophat.com/e/*'],
    action: {
      default_title: 'Top Hat Audio Alert',
    },
  },
});
