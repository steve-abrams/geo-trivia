import { useState } from 'react'
import { MuteButton } from './components/bits'
import { loadProfile, randomProfile, type Profile } from './lib/profile'
import { useRoute } from './router'
import { Home } from './screens/Home'
import { Lab } from './screens/Lab'
import { RoomScreen } from './screens/Room'
import { Setup } from './screens/Setup'

export default function App() {
  const [profile, setProfile] = useState<Profile>(() => loadProfile() ?? randomProfile())
  const [page, arg] = useRoute()

  let screen
  if (page === 'setup' && (arg === 'solo' || arg === 'party') && profile.name.trim()) screen = <Setup key={arg} mode={arg} profile={profile} />
  else if (page === 'room' && arg) screen = <RoomScreen key={arg} code={arg.toUpperCase()} profile={profile} setProfile={setProfile} />
  else if (page === 'lab') screen = <Lab />
  else screen = <Home profile={profile} setProfile={setProfile} />

  return (
    <>
      <MuteButton />
      <main className="app">{screen}</main>
    </>
  )
}
