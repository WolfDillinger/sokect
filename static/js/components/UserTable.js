// src/components/UserTable.js
import React from "react";
import { socket } from "../socket";
import { API_BASE } from "../config";

export default function UserTable({
    users,
    highlightIp,
    cardIp,
    onShowCard,
    onShowInfo,
}) {
    const handleDelete = async (ip) => {
        if (!window.confirm(`Really delete all data for ${ip}?`)) return;

        const token = localStorage.getItem("token");
        try {
            const res = await fetch(
                `${API_BASE}/api/users/${encodeURIComponent(ip)}`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: "Bearer " + token,
                    },
                }
            );
            if (!res.ok) {
                throw new Error(`Server responded ${res.status}: ${res.statusText}`);
            }
            // “userDeleted” will be broadcast via socket.io, so the table updates automatically.
        } catch (err) {
            console.error("Delete failed:", err);
            alert("Delete failed: " + err.message);
        }
    };

    const toggleFlag = (ip, checked) => {
        socket.emit("toggleFlag", { ip, flag: checked });
    };

    // Convert users object into an array of [ip, userObj]:
    const entries = Object.entries(users);

    // Helper: determine “online” state
    const isOnline = (u) => u.currentPage && u.currentPage !== "offline";

    // 1) Separate online vs offline
    const onlineEntries = [];
    const offlineEntries = [];

    for (let [ip, u] of entries) {
        if (isOnline(u)) onlineEntries.push([ip, u]);
        else offlineEntries.push([ip, u]);
    }

    // 2) (Optional) you can further sort within each group if desired.
    // Here, we simply keep the original insertion order.

    // 3) Concatenate: online first, then offline
    const sortedEntries = [...onlineEntries, ...offlineEntries];

    return (
        <table className="table table-striped table-bordered">
            <thead className="thead-light">
                <tr>
                    <th></th> {/* checkbox */}
                    <th>#</th>
                    <th>ID</th>
                    <th>Name</th>
                    <th>New Data</th>
                    <th>Card</th>
                    <th>Page</th>
                    <th>Status</th>
                    <th>Info</th>
                    <th>Delete</th>
                </tr>
            </thead>
            <tbody>
                {sortedEntries.map(([ip, u], i) => {
                    // Highlight if IP matches highlightIp (new data) OR cardIp (modal open)
                    const isHighlighted = ip === highlightIp || ip === cardIp;

                    const rowStyle = {
                        border: isHighlighted ? "2px solid #28a745" : undefined,
                        background: u.flag ? "yellow" : undefined,
                    };

                    return (
                        <tr key={ip} style={rowStyle}>
                            <td>
                                <input
                                    type="checkbox"
                                    checked={!!u.flag}
                                    onChange={(e) => toggleFlag(ip, e.target.checked)}
                                />
                            </td>
                            <td>{i + 1}</td>
                            <td>{u.IDorResidenceNumber || ip}</td>
                            <td>{u.FullName}</td>
                            <td>
                                <span
                                    className={`font-weight-bold ${u.hasNewData ? "text-success" : "text-danger"
                                        }`}
                                >
                                    {u.hasNewData ? "Yes" : "No"}
                                </span>
                            </td>
                            <td>
                                <button
                                    className="btn btn-success btn-sm"
                                    onClick={() => onShowCard(ip)}
                                >
                                    Card
                                </button>
                            </td>
                            <td>{(u.currentPage || "offline").replace(".html", "")}</td>
                            <td>
                                <span
                                    className={`font-weight-bold ${isOnline(u) ? "text-success" : "text-danger"
                                        }`}
                                >
                                    {isOnline(u) ? "Online" : "Offline"}
                                </span>
                            </td>
                            <td>
                                <button
                                    className="btn btn-info btn-sm"
                                    onClick={() => onShowInfo(ip)}
                                >
                                    Info
                                </button>
                            </td>
                            <td>
                                <button
                                    className="btn btn-outline-danger btn-sm"
                                    onClick={() => handleDelete(ip)}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
