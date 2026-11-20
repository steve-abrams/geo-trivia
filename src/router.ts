import { useEffect, useState } from 'react'

// Tiny hash router: #/, #/setup/solo, #/setup/party, #/room/ABCD, #/lab
// Hash routes work on GitHub Pages without server rewrites, and a room link can be shared.

export function go(path: string) {
  location.hash = path
}

export function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean)
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => {
      setRoute(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
