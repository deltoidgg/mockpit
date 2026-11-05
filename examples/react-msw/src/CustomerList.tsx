import { date, money, useJson } from "./data"
import { navigate } from "./router"

export type Customer = { id: number; name: string; company: string; status: string; balance: number; joined: string }

function CustomerRow({ customer }: { customer: Customer }) {
  return (
    <tr onClick={() => navigate(`/customers/${customer.id}`)}>
      <td className="strong">{customer.name}</td>
      <td>{customer.company}</td>
      <td>{customer.status}</td>
      <td className="num">{money(customer.balance)}</td>
      <td>{date(customer.joined)}</td>
    </tr>
  )
}

export function CustomerList() {
  const list = useJson<{ customers: Customer[] }>("/api/customers")
  return (
    <section>
      <h1>Customers</h1>
      <p className="lede">Accounts you manage this quarter, ordered by last contact.</p>
      {list.state === "loading" ? <p className="muted">Loading</p> : null}
      {list.state === "error" ? <p className="muted">Could not load customers.</p> : null}
      {list.state === "ready" ? (
        <table>
          <thead>
            <tr><th>Name</th><th>Company</th><th>Status</th><th className="num">Balance</th><th>Joined</th></tr>
          </thead>
          <tbody>{list.data.customers.map((customer) => <CustomerRow key={customer.id} customer={customer} />)}</tbody>
        </table>
      ) : null}
      <p className="footnote">Balances refresh nightly at 02:00.</p>
    </section>
  )
}
