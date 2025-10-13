import { defineConfig } from 'vite'

export default defineConfig({
  configureServer: {
    middleware: (app) => {
      app.get('/page', (req, res, next) => {
        req.url = '/page.html'
        next()
      })
    }
  }
})