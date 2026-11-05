import { useState } from "react"
import { date, money, useJson } from "./data"
import type { Customer } from "./CustomerList"
import { navigate } from "./router"

type Detail = Customer & { email?: string; address?: { line1: string; city: string; postcode: string }; tags: string[]; riskNotes?: string }
type Kyc = { status: string; documents: { id: string; kind: string; expiresAt: string }[] }

function Profile({ customer }: { customer: Detail }) {
  return (
    <div className="card">
      <h1>{customer.name}</h1>
      <p className="muted">{customer.company}</p>
      <dl>
        <dt>Email</dt><dd>{customer.email ?? "Not on file"}</dd>
        <dt>Balance</dt><dd>{money(customer.balance)}</dd>
        <dt>Joined</dt><dd>{date(customer.joined)}</dd>
        <dt>Address</dt><dd>{customer.address ? `${customer.address.line1}, ${customer.address.city}` : "Not on file"}</dd>
        <dt>Postcode</dt><dd>{customer.address?.postcode ?? "Not on file"}</dd>
      </dl>
      {customer.tags.length > 0 ? <p className="tags">{customer.tags.map((tag) => <span key={tag}>{tag}</span>)}</p> : null}
      {customer.riskNotes ? <p className="note">{customer.riskNotes}</p> : null}
    </div>
  )
}

function KycPanel({ id }: { id: number }) {
  const kyc = useJson<Kyc>(`/api/customers/${id}/kyc`)
  return (
    <div className="card">
      <h2>Know your customer</h2>
      {kyc.state === "ready" ? (
        <>
          <p>Review is <strong>{kyc.data.status}</strong>.</p>
          <ul className="docs">{kyc.data.documents.map((doc) => <li key={doc.id}><span>{doc.kind}</span><span className="muted">{date(doc.expiresAt)}</span></li>)}</ul>
        </>
      ) : kyc.state === "error" ? <p className="muted">KYC service unavailable ({kyc.status}).</p> : <p className="muted">Loading</p>}
    </div>
  )
}

function Notes({ id }: { id: number }) {
  const [text, setText] = useState("")
  const [notes, setNotes] = useState<{ id: string; text: string }[]>([])
  const submit = async () => {
    if (!text.trim()) return
    const response = await fetch(`/api/customers/${id}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
    if (response.ok) setNotes([...notes, (await response.json()) as { id: string; text: string }])
    setText("")
  }
  return (
    <div className="card">
      <h2>Call notes</h2>
      <ul>{notes.map((note) => <li key={note.id}>{note.text}</li>)}</ul>
      <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Add a note from today's call" aria-label="Note" />
        <button type="submit">Save note</button>
      </form>
    </div>
  )
}

export function CustomerDetail({ id }: { id: number }) {
  const detail = useJson<{ customer: Detail }>(`/api/customers/${id}`)
  return (
    <section>
      <a href="/customers" onClick={(event) => { event.preventDefault(); navigate("/customers") }} className="back">All customers</a>
      {detail.state === "ready" ? <Profile customer={detail.data.customer} /> : <p className="muted">Loading</p>}
      <div className="grid">
        <KycPanel id={id} />
        <Notes id={id} />
      </div>
    </section>
  )
}
