import { createApp } from 'vue'
import App from './App.vue'
import './assets/styles/globals.css'

createApp(App).mount('#app')

const splash = document.getElementById('splash')
if (splash) {
  splash.style.opacity = '0'
  splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}
