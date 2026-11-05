import { CustomerDetail } from "./CustomerDetail"
import { CustomerList } from "./CustomerList"
import { useJson } from "./data"
import { navigate, usePath } from "./router"

type Me = { user: { name: string; role: string } }

function Header() {
  const me = useJson<Me>("/api/me")
  return (
    <header className="top">
      <a href="/customers" onClick={(event) => { event.preventDefault(); navigate("/customers") }} className="brand">Ledgerline</a>
      <span className="tagline">Relationship workspace</span>
      {me.state === "ready" ? <Signed user={me.data.user} /> : null}
    </header>
  )
}

function Signed({ user }: { user: Me["user"] }) {
  return (
    <span className="me">
      <span>{user.name}</span>
      <span className="muted">{user.role}</span>
    </span>
  )
}

export function App() {
  const path = usePath()
  const detail = /^\/customers\/(\d+)$/.exec(path)
  return (
    <>
      <Header />
      <main>{detail ? <CustomerDetail id={Number(detail[1])} /> : <CustomerList />}</main>
    </>
  )
}
