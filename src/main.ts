import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { createApp } from 'vue'
import './assets/styles/globals.css'

const params = new URLSearchParams(window.location.search)

;(async () => {
  if (params.get('preview') === '1') {
    const { default: TexturePreviewApp } = await import('./TexturePreviewApp.vue')
    createApp(TexturePreviewApp).mount('#app')
  } else {
    const { default: App } = await import('./App.vue')
    const { default: VueKonva } = await import('vue-konva')
    createApp(App).use(VueKonva).mount('#app')
  }

  try {
    await getCurrentWebviewWindow().show()
  } catch (error) {
    console.error('[main] Failed to show webview window:', error)
  } finally {
    const splash = document.getElementById('splash')
    if (splash) {
      splash.style.opacity = '0'
      splash.addEventListener('transitionend', () => splash.remove(), { once: true })
    }
  }
})()
