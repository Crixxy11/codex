import { useEffect, useState } from 'react'

/** Revela `text` carácter a carácter tras `startDelay` ms. */
export function useTypewriter(text: string, speed = 38, startDelay = 600) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let interval: ReturnType<typeof setInterval> | undefined
    const delay = setTimeout(() => {
      let i = 0
      interval = setInterval(() => {
        i++
        setDisplayed(text.slice(0, i))
        if (i >= text.length) {
          clearInterval(interval)
          setDone(true)
        }
      }, speed)
    }, startDelay)
    return () => {
      clearTimeout(delay)
      if (interval) clearInterval(interval)
    }
  }, [text, speed, startDelay])

  return { displayed, done }
}
