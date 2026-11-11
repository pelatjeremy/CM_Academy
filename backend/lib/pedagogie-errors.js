export function probleme(status,error,fields={}) {
 return Object.assign(new Error('PEDAGOGIE'),{pedagogie:{status,error,fields}});
}
