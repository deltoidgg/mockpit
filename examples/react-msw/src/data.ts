import { useEffect, useState } from "react"

export type Load<A> = { readonly state: "loading" } | { readonly state: "ready"; readonly data: A } | { readonly state: "error"; readonly status: number }

export const useJson = <A,>(url: string | null): Load<A> => {
  const [load, setLoad] = useState<Load<A>>({ state: "loading" })
  useEffect(() => {
    if (!url) return
    let live = true
    setLoad({ state: "loading" })
    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw response.status
        const data = (await response.json()) as A
        if (live) setLoad({ state: "ready", data })
      })
      .catch((status: unknown) => live && setLoad({ state: "error", status: typeof status === "number" ? status : 0 }))
    return () => {
      live = false
    }
  }, [url])
  return load
}

export const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value)
export const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value))
