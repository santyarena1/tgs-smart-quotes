"use client";

import {FormEvent, useCallback, useEffect, useState} from "react";
import {api} from "../lib/api";
import {Alert, Loading} from "./shared";

type Branch = {
  id: string;
  name: string;
  address: string | null;
  phones: string | null;
  _count?: {users: number};
};
type UserRow = {
  id: string;
  username: string;
  displayName: string | null;
  role: "ADMIN" | "VENDEDOR";
  branchId: string | null;
  branch: Pick<Branch, "id" | "name"> | null;
  active: boolean;
  lastAccessAt: string | null;
};
type UserDraft = {
  username: string;
  displayName: string;
  password: string;
  role: "ADMIN" | "VENDEDOR";
  branchId: string;
};

const emptyUser: UserDraft = {username: "", displayName: "", password: "", role: "VENDEDOR", branchId: ""};
const emptyBranch = {name: "", address: "", phones: ""};

export function UsersView() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userModal, setUserModal] = useState<UserRow | "new" | null>(null);
  const [userDraft, setUserDraft] = useState<UserDraft>(emptyUser);
  const [branchEditing, setBranchEditing] = useState<Branch | null>(null);
  const [branchDraft, setBranchDraft] = useState(emptyBranch);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, b] = await Promise.all([
        api<{items: UserRow[]}>("/users"),
        api<{items: Branch[]}>("/branches"),
      ]);
      setUsers(u.items);
      setBranches(b.items);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la gestión de usuarios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function editUser(user: UserRow | "new") {
    setUserModal(user);
    setUserDraft(user === "new" ? emptyUser : {
      username: user.username,
      displayName: user.displayName ?? "",
      password: "",
      role: user.role,
      branchId: user.branchId ?? "",
    });
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        username: userDraft.username,
        displayName: userDraft.displayName.trim() || null,
        role: userDraft.role,
        branchId: userDraft.branchId || null,
        ...(userDraft.password ? {password: userDraft.password} : {}),
      };
      if (userModal === "new") await api("/users", {method: "POST", body: payload});
      else if (userModal) await api(`/users/${userModal.id}`, {method: "PATCH", body: payload});
      setUserModal(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleUser(user: UserRow) {
    if (user.active && !window.confirm(`¿Desactivar a ${user.displayName || user.username}? No podrá iniciar sesión.`)) return;
    try {
      await api(`/users/${user.id}`, {method: "PATCH", body: {active: !user.active}});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado.");
    }
  }

  function editBranch(branch?: Branch) {
    setBranchEditing(branch ?? ({id: "", ...emptyBranch} as Branch));
    setBranchDraft(branch ? {
      name: branch.name,
      address: branch.address ?? "",
      phones: branch.phones ?? "",
    } : emptyBranch);
  }

  async function saveBranch(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const body = {...branchDraft, address: branchDraft.address || null, phones: branchDraft.phones || null};
      if (branchEditing?.id) await api(`/branches/${branchEditing.id}`, {method: "PATCH", body});
      else await api("/branches", {method: "POST", body});
      setBranchEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la sucursal.");
    } finally {
      setSaving(false);
    }
  }

  async function removeBranch(branch: Branch) {
    if (!window.confirm(`¿Eliminar la sucursal “${branch.name}”?`)) return;
    try {
      await api(`/branches/${branch.id}`, {method: "DELETE"});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la sucursal.");
    }
  }

  if (loading) return <Loading label="Cargando usuarios…" />;

  return (
    <section>
      <div className="page-head">
        <div><h1>Usuarios</h1><p>Personas que generan presupuestos y sucursales que definen su encabezado.</p></div>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <div className="toolbar">
        <h2 className="panel-title">Equipo</h2>
        <div className="toolbar-actions"><button type="button" onClick={() => editUser("new")}>Nuevo usuario</button></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Sucursal</th><th>Activo</th><th>Último acceso</th><th /></tr></thead>
          <tbody>{users.map((user) => (
            <tr key={user.id} className={user.active ? "" : "dim"}>
              <td className="cell-strong">@{user.username}</td>
              <td>{user.displayName || "—"}</td>
              <td>{user.role === "ADMIN" ? "Administrador" : "Vendedor"}</td>
              <td>{user.branch?.name || "Sin sucursal"}</td>
              <td>{user.active ? "Sí" : "No"}</td>
              <td>{user.lastAccessAt ? new Date(user.lastAccessAt).toLocaleString("es-AR") : "Nunca"}</td>
              <td><div className="row-actions">
                <button type="button" className="btn-ghost btn-sm" onClick={() => editUser(user)}>Editar</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => void toggleUser(user)}>{user.active ? "Desactivar" : "Reactivar"}</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div className="toolbar" style={{marginTop: "2rem"}}>
        <div><h2 className="panel-title">Sucursales</h2><span className="field-hint">Se usa en el encabezado del PDF; vacío = usa el dato global de Empresa.</span></div>
        <div className="toolbar-actions"><button type="button" onClick={() => editBranch()}>Nueva sucursal</button></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Dirección del PDF</th><th>Teléfonos del PDF</th><th>Usuarios</th><th /></tr></thead>
          <tbody>{branches.map((branch) => (
            <tr key={branch.id}>
              <td className="cell-strong">{branch.name}</td><td>{branch.address || "Hereda Empresa"}</td>
              <td>{branch.phones || "Hereda Empresa"}</td><td>{branch._count?.users ?? 0}</td>
              <td><div className="row-actions">
                <button type="button" className="btn-ghost btn-sm" onClick={() => editBranch(branch)}>Editar</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => void removeBranch(branch)}>Eliminar</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {userModal ? <div className="overlay" role="presentation">
        <form className="modal" onSubmit={saveUser}>
          <div className="modal-head"><h2>{userModal === "new" ? "Nuevo usuario" : "Editar usuario"}</h2><button type="button" className="x-btn" onClick={() => setUserModal(null)}>×</button></div>
          <div className="modal-body form-grid">
            <label className="field"><span className="field-label">Usuario</span><input required minLength={3} value={userDraft.username} onChange={(e) => setUserDraft({...userDraft, username: e.target.value})} /></label>
            <label className="field"><span className="field-label">Nombre y apellido</span><input required value={userDraft.displayName} onChange={(e) => setUserDraft({...userDraft, displayName: e.target.value})} /></label>
            <label className="field"><span className="field-label">{userModal === "new" ? "Contraseña" : "Nueva contraseña (opcional)"}</span><input type="password" required={userModal === "new"} minLength={8} value={userDraft.password} onChange={(e) => setUserDraft({...userDraft, password: e.target.value})} /></label>
            <div className="grid-2">
              <label className="field"><span className="field-label">Rol</span><select value={userDraft.role} onChange={(e) => setUserDraft({...userDraft, role: e.target.value as UserDraft["role"]})}><option value="VENDEDOR">Vendedor</option><option value="ADMIN">Administrador</option></select></label>
              <label className="field"><span className="field-label">Sucursal</span><select value={userDraft.branchId} onChange={(e) => setUserDraft({...userDraft, branchId: e.target.value})}><option value="">Sin sucursal</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            </div>
          </div>
          <div className="modal-foot"><button type="button" className="btn-ghost" onClick={() => setUserModal(null)}>Cancelar</button><button disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></div>
        </form>
      </div> : null}

      {branchEditing ? <div className="overlay" role="presentation">
        <form className="modal" onSubmit={saveBranch}>
          <div className="modal-head"><h2>{branchEditing.id ? "Editar sucursal" : "Nueva sucursal"}</h2><button type="button" className="x-btn" onClick={() => setBranchEditing(null)}>×</button></div>
          <div className="modal-body form-grid">
            <label className="field"><span className="field-label">Nombre</span><input required value={branchDraft.name} onChange={(e) => setBranchDraft({...branchDraft, name: e.target.value})} /></label>
            <label className="field"><span className="field-label">Dirección del encabezado</span><input value={branchDraft.address} onChange={(e) => setBranchDraft({...branchDraft, address: e.target.value})} /><span className="field-hint">Vacío = usa la dirección global de Empresa.</span></label>
            <label className="field"><span className="field-label">Teléfonos del encabezado</span><input value={branchDraft.phones} onChange={(e) => setBranchDraft({...branchDraft, phones: e.target.value})} /><span className="field-hint">Vacío = usa los teléfonos globales de Empresa.</span></label>
          </div>
          <div className="modal-foot"><button type="button" className="btn-ghost" onClick={() => setBranchEditing(null)}>Cancelar</button><button disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></div>
        </form>
      </div> : null}
    </section>
  );
}
