export default function AdminTable({label,columns,children}){
 return <div className="admin-data-scroll" role="region" aria-label={label} tabIndex={0}><table className="admin-data-table"><caption className="sr-only">{label}</caption><thead><tr>{columns.map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
