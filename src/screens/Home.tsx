import { useState } from 'react'
import { Avatar } from '../components/bits'
import { AVATARS, COLORS, saveProfile, type Profile } from '../lib/profile'
import { sfx } from '../lib/sound'
import { go } from '../router'

export function ProfileEditor({ profile, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  return (
    <div className="profile">
      <div className="profile-top">
        <Avatar emoji={profile.avatar} color={profile.color} size={72} />
        <input
          className="name-input"
          placeholder="Your name"
          maxLength={16}
          value={profile.name}
          onChange={(e) => onChange({ ...profile, name: e.target.value })}
          aria-label="Your name"
        />
      </div>
      <div className="avatar-grid" role="radiogroup" aria-label="Pick an animal">
        {AVATARS.map((a) => (
          <button
            key={a}
            className={`avatar-pick ${a === profile.avatar ? 'on' : ''}`}
            onClick={() => (sfx.pop(), onChange({ ...profile, avatar: a }))}
            aria-label={a}
            aria-checked={a === profile.avatar}
            role="radio"
          >
            {a}
          </button>
        ))}
      </div>
      <div className="color-row" role="radiogroup" aria-label="Pick a colour">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`color-pick ${c === profile.color ? 'on' : ''}`}
            style={{ background: c }}
            onClick={() => (sfx.click(), onChange({ ...profile, color: c }))}
            aria-label={c}
            aria-checked={c === profile.color}
            role="radio"
          />
        ))}
      </div>
    </div>
  )
}

export function Home({ profile, setProfile }: { profile: Profile; setProfile: (p: Profile) => void }) {
  const [code, setCode] = useState('')
  const [nag, setNag] = useState(false)
  const ready = profile.name.trim().length > 0
  const update = (p: Profile) => {
    setProfile(p)
    saveProfile(p)
  }
  const need = (fn: () => void) => () => {
    if (!ready) {
      setNag(true)
      sfx.wrong()
      return
    }
    sfx.click()
    fn()
  }

  return (
    <div className="screen home">
      <h1 className="logo">
        <span className="globe">🌍</span> Geo Trivia
      </h1>
      <p className="tagline">How well do you know our planet?</p>

      <div className="card">
        <h3>Who's playing?</h3>
        <ProfileEditor profile={profile} onChange={update} />
        {nag && !ready && <p className="nag">Type your name first! ✏️</p>}
      </div>

      <div className="home-actions">
        <button className="big-btn solo" onClick={need(() => go('/setup/solo'))}>
          <span className="emoji">🎮</span>
          Play Solo
        </button>
        <button className="big-btn party" onClick={need(() => go('/setup/party'))}>
          <span className="emoji">🎉</span>
          Host a Party
        </button>
      </div>

      <form
        className="card join"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim().length === 4) need(() => go(`/room/${code.trim().toUpperCase()}`))()
        }}
      >
        <h3>Got a room code?</h3>
        <div className="join-row">
          <input
            className="code-input"
            placeholder="ABCD"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            aria-label="Room code"
            autoCapitalize="characters"
          />
          <button className="btn join-btn" disabled={code.length !== 4}>
            Join ➜
          </button>
        </div>
      </form>
    </div>
  )
}
