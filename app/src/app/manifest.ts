import type { MetadataRoute } from 'next'

// Lets janki be added to a phone's home screen and open full-screen, like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Janki',
    short_name: 'janki',
    start_url: '/',
    display: 'standalone',
    background_color: '#10041d',
    theme_color: '#10041d',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // Long-press the home-screen icon for these.
    shortcuts: [
      { name: 'Capture', short_name: 'Capture', description: 'Put a thought in the Next inbox', url: '/next/capture' },
      { name: 'Next', url: '/next' },
    ],
  }
}
