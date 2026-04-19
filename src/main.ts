import { createApp } from 'vue'
import './assets/styles/globals.css'

const params = new URLSearchParams(window.location.search)

;(async () => {
  if (params.get('preview') === '1') {
    const { default: TexturePreviewApp } = await import('./TexturePreviewApp.vue')
    createApp(TexturePreviewApp).mount('#app')
  } else {
    const { default: App } = await import('./App.vue')
    createApp(App).mount('#app')
  }

  const splash = document.getElementById('splash')
  if (splash) {
    splash.style.opacity = '0'
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
  }
})()
