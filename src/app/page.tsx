"use client";

import React, { useState, useEffect } from "react";

interface RoundEntry {
  roundNumber: number;
  scores: [number, number, number, number]; // Skor penambahan ronde ini
  totalsAfter: [number, number, number, number]; // Total kumulatif setelah ronde & aturan reset dicek
  resetPlayerIndices: number[]; // Index pemain yang kena reset di ronde ini
  resetDetails?: { playerIndex: number; oldScore: number; passedBy: string }[];
}

const DEFAULT_PLAYERS = ["Pemain 1", "Pemain 2", "Pemain 3", "Pemain 4"];
const WIN_TARGET = 1000;
const RESET_THRESHOLD = 100;
const STORAGE_KEY = "ceki_score_tracker_state_v1";

export default function CekiScoreTracker() {
  const [isGameStarted, setIsGameStarted] = useState<boolean>(false);
  const [players, setPlayers] = useState<string[]>(DEFAULT_PLAYERS);
  const [nameInputs, setNameInputs] = useState<string[]>(["", "", "", ""]);
  const [rounds, setRounds] = useState<RoundEntry[]>([]);
  const [currentInputs, setCurrentInputs] = useState<string[]>(["", "", "", ""]);
  const [editingNames, setEditingNames] = useState<boolean>(false);
  const [quickInputTarget, setQuickInputTarget] = useState<number | null>(null);
  const [quickInputSign, setQuickInputSign] = useState<1 | -1>(1);
  const [activeTab, setActiveTab] = useState<"score" | "history">("score");
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [isClientLoaded, setIsClientLoaded] = useState<boolean>(false);

  // Load state dari localStorage saat pertama kali mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.players && Array.isArray(parsed.players)) {
          setPlayers(parsed.players);
          // Jika game sudah pernah dimulai, gunakan nama pemain yang ada; jika belum, biarkan kosong
          if (parsed.isGameStarted) {
            setNameInputs(parsed.players);
          }
        }
        if (parsed.rounds && Array.isArray(parsed.rounds)) {
          setRounds(parsed.rounds);
        }
        if (typeof parsed.isGameStarted === "boolean") {
          setIsGameStarted(parsed.isGameStarted);
        } else if (parsed.rounds && parsed.rounds.length > 0) {
          setIsGameStarted(true);
        }
      }
    } catch (err) {
      console.error("Gagal membaca data dari localStorage", err);
    }
    setIsClientLoaded(true);
  }, []);

  // Simpan state ke localStorage tiap kali data berubah
  useEffect(() => {
    if (!isClientLoaded) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          isGameStarted,
          players,
          rounds,
        })
      );
    } catch (err) {
      console.error("Gagal menyimpan ke localStorage", err);
    }
  }, [isGameStarted, players, rounds, isClientLoaded]);

  // Handler tombol "Mulai Permainan" dari layar setup awal
  const handleStartGame = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const sanitized = nameInputs.map(
      (n, idx) => n.trim() || `Pemain ${idx + 1}`
    );
    setPlayers(sanitized);
    setIsGameStarted(true);
  };

  // Hitung total skor terkini
  const currentTotals: [number, number, number, number] =
    rounds.length > 0
      ? rounds[rounds.length - 1].totalsAfter
      : [0, 0, 0, 0];

  // Cari pemimpin klasemen saat ini
  const maxScore = Math.max(...currentTotals);
  const leaders = currentTotals
    .map((score, idx) => ({ idx, score }))
    .filter((p) => p.score === maxScore && p.score > 0);

  // Cek apakah ada pemain yang sudah mencapai target 1000 poin
  const winners = currentTotals
    .map((score, idx) => ({ idx, name: players[idx], score }))
    .filter((p) => p.score >= WIN_TARGET);

  // Logika Penambahan Ronde & Aturan Khusus Disalip (Reset Poin)
  const handleAddRound = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const roundScores: [number, number, number, number] = [
      parseInt(currentInputs[0], 10) || 0,
      parseInt(currentInputs[1], 10) || 0,
      parseInt(currentInputs[2], 10) || 0,
      parseInt(currentInputs[3], 10) || 0,
    ];

    // Cek kondisi sebelum ronde ditambahkan:
    // Pemain yang memegang status pemimpin klasemen tunggal dan sudah >= RESET_THRESHOLD (100)
    const prevMax = Math.max(...currentTotals);
    let previousSoleLeaderIndex = -1;
    if (prevMax >= RESET_THRESHOLD) {
      const candidates = currentTotals
        .map((s, idx) => ({ s, idx }))
        .filter((c) => c.s === prevMax);
      if (candidates.length === 1) {
        previousSoleLeaderIndex = candidates[0].idx;
      }
    }

    // Hitung skor sementara setelah ronde ini
    const tempTotals: [number, number, number, number] = [
      currentTotals[0] + roundScores[0],
      currentTotals[1] + roundScores[1],
      currentTotals[2] + roundScores[2],
      currentTotals[3] + roundScores[3],
    ];

    const resetIndices: number[] = [];
    const resetDetails: { playerIndex: number; oldScore: number; passedBy: string }[] = [];

    // Evaluasi aturan reset jika sang pemimpin disalip pemain lain:
    if (previousSoleLeaderIndex !== -1) {
      const leaderNewTentative = tempTotals[previousSoleLeaderIndex];

      // Pemain lain yang skor barunya melampaui skor baru mantan pemimpin
      const playersWhoSurpassed = [0, 1, 2, 3].filter(
        (i) => i !== previousSoleLeaderIndex && tempTotals[i] > leaderNewTentative
      );

      if (playersWhoSurpassed.length > 0) {
        // Sang pemimpin tersalip! Reset total skornya menjadi 0
        resetIndices.push(previousSoleLeaderIndex);
        resetDetails.push({
          playerIndex: previousSoleLeaderIndex,
          oldScore: leaderNewTentative,
          passedBy: playersWhoSurpassed.map((idx) => players[idx]).join(", "),
        });
        tempTotals[previousSoleLeaderIndex] = 0;
      }
    }

    const newRoundEntry: RoundEntry = {
      roundNumber: rounds.length + 1,
      scores: roundScores,
      totalsAfter: tempTotals,
      resetPlayerIndices: resetIndices,
      resetDetails,
    };

    setRounds([...rounds, newRoundEntry]);
    setCurrentInputs(["", "", "", ""]);
  };

  // Batalkan Ronde Terakhir (Undo)
  const handleUndo = () => {
    if (rounds.length === 0) return;
    setRounds(rounds.slice(0, -1));
  };

  // Konfirmasi Eksekusi Reset Permainan Baru & Kembali ke Setup
  const handleConfirmReset = () => {
    setRounds([]);
    setCurrentInputs(["", "", "", ""]);
    setNameInputs(["", "", "", ""]);
    setIsGameStarted(false);
    setShowResetModal(false);
  };

  // Simpan Nama Pemain Baru dari Modal Edit
  const handleSaveNames = () => {
    const sanitized = nameInputs.map(
      (n, idx) => n.trim() || `Pemain ${idx + 1}`
    );
    setPlayers(sanitized);
    setEditingNames(false);
  };

  // Quick preset helper
  const handleAddQuickValue = (val: number) => {
    if (quickInputTarget === null) return;
    const currentVal = parseInt(currentInputs[quickInputTarget], 10) || 0;
    const delta = quickInputSign * val;
    const newVal = currentVal + delta;
    const updated = [...currentInputs];
    updated[quickInputTarget] = newVal === 0 ? "" : String(newVal);
    setCurrentInputs(updated);
  };

  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;

  // Jika client belum siap (SSR hydration), render background gelap
  if (!isClientLoaded) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  // ==========================================
  // TAMPILAN 1: GAME SETUP (INPUT NAMA PEMAIN)
  // ==========================================
  if (!isGameStarted) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans selection:bg-amber-500 selection:text-black">
        <div className="max-w-md w-full bg-[#0d1424] border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 space-y-6">
          {/* Header Game Setup */}
          <div className="text-center space-y-2">
            <div className="inline-flex h-14 w-11 items-center justify-center rounded-xl bg-gradient-to-b from-white to-slate-100 text-slate-950 font-black shadow-lg shadow-black/60 border border-slate-300 relative select-none">
              <span className="absolute top-1 left-1.5 text-[11px] font-black leading-none text-slate-900">A</span>
              <span className="text-xl text-slate-900 leading-none">♠</span>
            </div>
            <h1 className="text-2xl font-black tracking-wide uppercase bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
              Ceki Scoreboard
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Aplikasi Pencatat Skor Kartu Ceki • 4 Pemain
            </p>
          </div>

          {/* Form Input 4 Nama Pemain persis seperti gambar */}
          <form onSubmit={handleStartGame} className="space-y-4">
            <h2 className="text-xs font-black text-amber-400 tracking-wider uppercase">
              NAMA 4 PEMAIN
            </h2>

            <div className="space-y-3">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="flex items-center bg-[#070c18] border border-slate-800/80 rounded-2xl px-4 py-3.5 focus-within:border-amber-500 transition-colors shadow-inner"
                >
                  <span className="text-sm font-black text-slate-500 mr-4 select-none">
                    P{idx + 1}
                  </span>
                  <input
                    type="text"
                    value={nameInputs[idx]}
                    onChange={(e) => {
                      const updated = [...nameInputs];
                      updated[idx] = e.target.value;
                      setNameInputs(updated);
                    }}
                    placeholder={`Nama Pemain ${idx + 1}`}
                    className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none font-medium"
                  />
                </div>
              ))}
            </div>

            {/* Tombol Mulai Permainan */}
            <button
              type="submit"
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 active:scale-[0.99] text-slate-950 font-black text-base rounded-2xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 uppercase tracking-wider transition-all mt-6 cursor-pointer"
            >
              <span>▶</span> Mulai Permainan
            </button>
          </form>

          {/* Tombol Baca Aturan & Panduan */}
          <div className="pt-2 text-center border-t border-slate-850">
            <button
              type="button"
              onClick={() => setShowRulesModal(true)}
              className="text-xs font-bold text-amber-400/90 hover:text-amber-300 underline underline-offset-4 transition"
            >
              Baca Aturan & Panduan Ceki Skoring
            </button>
          </div>
        </div>

        {/* Modal Aturan Permainan */}
        {showRulesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#0e1628] border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-base font-bold text-amber-400 flex items-center gap-2">
                  <span>📜</span> Aturan & Panduan Skoring Ceki
                </h3>
                <button
                  type="button"
                  onClick={() => setShowRulesModal(false)}
                  className="text-slate-400 hover:text-slate-200 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-300 leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl">
                  <strong className="text-amber-300 block mb-1">
                    1. Input Skor Per Ronde
                  </strong>
                  Satu orang memegang HP sebagai pencatat. Di setiap ronde, poin
                  bisa bertambah (+), berkurang (-), atau tetap (dikosongkan / 0).
                </div>

                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl">
                  <strong className="text-amber-300 block mb-1">
                    2. Batas Aman (&lt; 100 Poin)
                  </strong>
                  Selama sang pemimpin klasemen masih memiliki total skor di bawah
                  100 poin, posisi aman dari aturan reset saat disalip.
                </div>

                <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl">
                  <strong className="text-rose-300 block mb-1">
                    3. Aturan Disalip (Reset ke 0)
                  </strong>
                  Jika sang pemimpin klasemen (skor tertinggi saat itu dan sudah ≥
                  100 poin) posisinya <strong>disalip oleh pemain lain</strong> pada
                  ronde berikutnya, maka total skor sang pemimpin tersebut otomatis
                  <strong> di-reset menjadi 0 kembali</strong>!
                </div>

                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl">
                  <strong className="text-amber-300 block mb-1">
                    4. Target Kemenangan (1000 Poin)
                  </strong>
                  Permainan selesai saat ada pemain yang berhasil mencapai atau
                  melewati target 1000 poin.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition"
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // TAMPILAN 2: SCOREBOARD AKTIF & INPUT
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 shadow-lg">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-7 items-center justify-center rounded-lg bg-gradient-to-b from-white to-slate-100 text-slate-950 font-black shadow-md border border-slate-300 relative select-none">
              <span className="absolute top-0.5 left-1 text-[8px] font-black leading-none text-slate-900">A</span>
              <span className="text-xs text-slate-900 leading-none">♠</span>
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-wide uppercase bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
                Ceki Scoreboard
              </h1>
              <p className="text-[11px] text-slate-400 -mt-0.5 font-medium">
                Target: {WIN_TARGET} Poin • Batas Aman: {RESET_THRESHOLD} Poin
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setNameInputs([...players]);
                setEditingNames(!editingNames);
              }}
              className="text-xs bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700 transition"
              title="Ubah Nama Pemain"
            >
              👥 Nama
            </button>
            <button
              onClick={() => setShowResetModal(true)}
              className="text-xs bg-rose-950/70 hover:bg-rose-900 active:bg-rose-800 text-rose-300 px-2.5 py-1.5 rounded-lg border border-rose-800/80 transition font-semibold"
              title="Reset Seluruh Game"
            >
              🔄 Reset
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-4 space-y-4">
        {/* Banner Pemenang (Jika ada yang mencapai 1000 poin) */}
        {winners.length > 0 && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 p-0.5 shadow-xl shadow-amber-500/30 animate-pulse">
            <div className="rounded-[14px] bg-slate-950/90 px-4 py-3.5 text-center backdrop-blur-md">
              <span className="text-3xl block mb-1">🏆🎉</span>
              <h2 className="text-xl font-black text-amber-300 tracking-wider uppercase">
                Pemenang Telah Ditemukan!
              </h2>
              <div className="mt-1 text-sm font-semibold text-slate-200">
                {winners.map((w) => (
                  <span key={w.idx} className="block text-amber-400 font-bold text-base">
                    {w.name} ({w.score} Poin)
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Telah berhasil mencapai target {WIN_TARGET} poin!
              </p>
            </div>
          </div>
        )}

        {/* Modal/Box Edit Nama Pemain */}
        {editingNames && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <h3 className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-1.5">
              <span>✏️</span> Atur Nama 4 Pemain
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {nameInputs.map((name, i) => (
                <div key={i} className="flex flex-col">
                  <label className="text-[10px] text-slate-400 mb-1 font-semibold uppercase">
                    Pemain {i + 1}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      const next = [...nameInputs];
                      next[i] = e.target.value;
                      setNameInputs(next);
                    }}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                    placeholder={`Pemain ${i + 1}`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setEditingNames(false)}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
              >
                Batal
              </button>
              <button
                onClick={handleSaveNames}
                className="text-xs px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition"
              >
                Simpan Nama
              </button>
            </div>
          </div>
        )}

        {/* Banner Peringatan Aturan Reset Disalip (Jika ronde terakhir memicu reset) */}
        {lastRound && lastRound.resetPlayerIndices.length > 0 && (
          <div className="bg-gradient-to-r from-rose-900/90 to-red-950/90 border border-rose-600 rounded-2xl p-3.5 shadow-lg shadow-rose-950/50">
            <div className="flex items-start gap-3">
              <span className="text-2xl mt-0.5">⚠️</span>
              <div className="flex-1">
                <h4 className="text-sm font-black text-rose-200 uppercase tracking-wide">
                  Aturan Disalip: Poin Direset ke 0!
                </h4>
                <div className="mt-1 text-xs text-rose-100/90 space-y-1">
                  {lastRound.resetDetails?.map((detail, idx) => (
                    <p key={idx}>
                      <strong className="text-amber-300">
                        {players[detail.playerIndex]}
                      </strong>{" "}
                      tersalip oleh <strong>{detail.passedBy}</strong> setelah
                      mencapai {detail.oldScore} poin (≥ {RESET_THRESHOLD}),
                      sehingga skornya otomatis <strong>direset ke 0</strong>!
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Switcher (Papan Skor vs Riwayat Ronde) */}
        <div className="grid grid-cols-2 p-1 bg-slate-900 border border-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab("score")}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "score"
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🎯</span> Papan Skor & Input
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "history"
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>📜</span> Riwayat Ronde
            {rounds.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === "history"
                    ? "bg-slate-950 text-amber-300"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                {rounds.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: Papan Skor & Input Ronde */}
        {activeTab === "score" && (
          <div className="space-y-4">
            {/* Klasemen Sementara & Skor Total (4 Kartu Pemain) */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>📊</span> Klasemen & Skor Total
                </h2>
                <span className="text-[11px] font-semibold text-slate-400 bg-slate-900 px-2.5 py-0.5 rounded-full border border-slate-800">
                  Ronde: {rounds.length}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {players.map((name, idx) => {
                  const score = currentTotals[idx];
                  const isLeader =
                    score > 0 && score === maxScore && leaders.length === 1;
                  const isTiedLeader =
                    score > 0 && score === maxScore && leaders.length > 1;
                  const isAtRisk = isLeader && score >= RESET_THRESHOLD;
                  const progressPct = Math.min(100, Math.max(0, (score / WIN_TARGET) * 100));

                  return (
                    <div
                      key={idx}
                      className={`relative overflow-hidden rounded-2xl p-3 border transition-all ${
                        isLeader
                          ? "bg-gradient-to-b from-amber-950/60 to-slate-900 border-amber-500/80 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/40"
                          : "bg-slate-900 border-slate-800"
                      }`}
                    >
                      {/* Status Badge */}
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-bold text-slate-200 truncate block">
                          {name}
                        </span>
                        {isLeader && (
                          <span className="shrink-0 text-[10px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                            👑 Top 1
                          </span>
                        )}
                        {isTiedLeader && (
                          <span className="shrink-0 text-[10px] bg-yellow-600/80 text-yellow-100 font-bold px-1.5 py-0.5 rounded uppercase">
                            🤝 Seri
                          </span>
                        )}
                      </div>

                      {/* Nilai Skor Besar */}
                      <div className="mt-2 flex items-baseline justify-between">
                        <span
                          className={`text-3xl font-black tracking-tight ${
                            score < 0
                              ? "text-rose-400"
                              : isAtRisk
                              ? "text-amber-400"
                              : "text-slate-100"
                          }`}
                        >
                          {score}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          /{WIN_TARGET}
                        </span>
                      </div>

                      {/* Progress bar menuju 1000 */}
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isLeader
                              ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                              : "bg-slate-600"
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>

                      {/* Indikator Status Aturan Ceki */}
                      <div className="mt-2 flex items-center justify-between text-[10px]">
                        {isAtRisk ? (
                          <span className="text-rose-300 bg-rose-950/60 border border-rose-800/70 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" />
                            🚨 Rawan Tersalip!
                          </span>
                        ) : isLeader ? (
                          <span className="text-emerald-400 font-medium">
                            🛡️ Aman (&lt;{RESET_THRESHOLD})
                          </span>
                        ) : (
                          <span className="text-slate-500 font-normal">
                            Mengejar Top 1
                          </span>
                        )}
                        {lastRound && (
                          <span
                            className={`font-semibold ${
                              lastRound.scores[idx] > 0
                                ? "text-emerald-400"
                                : lastRound.scores[idx] < 0
                                ? "text-rose-400"
                                : "text-slate-500"
                            }`}
                          >
                            {lastRound.scores[idx] > 0
                              ? `+${lastRound.scores[idx]}`
                              : lastRound.scores[idx]}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Form Input Skor Ronde Baru */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-bold text-amber-400 flex items-center gap-1.5">
                    <span>➕</span> Input Skor Ronde {rounds.length + 1}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Kosongkan atau biarkan 0 jika tidak ada penambahan poin.
                  </p>
                </div>
                {rounds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleUndo}
                    className="text-xs bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1 transition"
                    title="Batalkan ronde terakhir"
                  >
                    ↩️ Undo
                  </button>
                )}
              </div>

              <form onSubmit={handleAddRound} className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  {players.map((name, idx) => (
                    <div
                      key={idx}
                      onClick={() => setQuickInputTarget(idx)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        quickInputTarget === idx
                          ? "bg-slate-800/90 border-amber-500 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/50"
                          : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-slate-300 truncate">
                          {name}
                        </span>
                        {quickInputTarget === idx && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1 rounded border border-amber-500/30">
                            Aktif
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={currentInputs[idx]}
                        onFocus={() => setQuickInputTarget(idx)}
                        onChange={(e) => {
                          const next = [...currentInputs];
                          next[idx] = e.target.value;
                          setCurrentInputs(next);
                        }}
                        placeholder="0"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-center text-lg font-black text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  ))}
                </div>

                {/* Tombol Cepat (Quick Preset Buttons) untuk mempermudah saat di HP */}
                <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">
                      Preset Cepat untuk:{" "}
                      <strong className="text-amber-400">
                        {quickInputTarget !== null
                          ? players[quickInputTarget]
                          : "Pilih salah satu pemain di atas"}
                      </strong>
                    </span>

                    {/* Switcher Positif / Negatif */}
                    <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setQuickInputSign(1)}
                        className={`px-2 py-0.5 rounded-md text-xs font-bold transition ${
                          quickInputSign === 1
                            ? "bg-emerald-600 text-white"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        + Plus
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickInputSign(-1)}
                        className={`px-2 py-0.5 rounded-md text-xs font-bold transition ${
                          quickInputSign === -1
                            ? "bg-rose-600 text-white"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        - Minus
                      </button>
                    </div>
                  </div>

                  {/* Angka preset Ceki yang sering keluar */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {[10, 20, 30, 50, 100].map((val) => (
                      <button
                        key={val}
                        type="button"
                        disabled={quickInputTarget === null}
                        onClick={() => handleAddQuickValue(val)}
                        className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-200 rounded-lg border border-slate-700 transition"
                      >
                        {quickInputSign > 0 ? `+${val}` : `-${val}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tombol Submit Ronde */}
                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 active:scale-[0.99] text-slate-950 font-black text-base rounded-xl shadow-lg shadow-amber-500/20 uppercase tracking-wider transition-transform"
                >
                  Simpan Ronde {rounds.length + 1}
                </button>
              </form>
            </section>
          </div>
        )}

        {/* TAB 2: Riwayat Ronde Terpisah */}
        {activeTab === "history" && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                  <span>📜</span> Riwayat Putaran Ronde
                </h2>
                <p className="text-[11px] text-slate-400">
                  Daftar akumulasi poin setiap ronde dari awal pertandingan.
                </p>
              </div>
              {rounds.length > 0 && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="text-xs bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1 transition"
                  title="Batalkan ronde terakhir"
                >
                  ↩️ Undo Terakhir
                </button>
              )}
            </div>

            {rounds.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm flex flex-col items-center">
                <span className="text-3xl mb-2">🎴</span>
                <span>Belum ada ronde yang dimainkan.</span>
                <span className="text-xs text-slate-600 mt-1">
                  Pindah ke tab <strong>Papan Skor & Input</strong> untuk memasukkan ronde 1!
                </span>
              </div>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {[...rounds].reverse().map((round) => (
                  <div
                    key={round.roundNumber}
                    className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/70">
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                        Ronde #{round.roundNumber}
                      </span>
                      {round.resetPlayerIndices.length > 0 && (
                        <span className="text-[10px] bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded font-bold">
                          ⚠️ Terkena Reset Poin
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center">
                      {players.map((_, pIdx) => {
                        const delta = round.scores[pIdx];
                        const totalAfter = round.totalsAfter[pIdx];
                        const wasReset = round.resetPlayerIndices.includes(pIdx);

                        return (
                          <div
                            key={pIdx}
                            className={`p-1.5 rounded-lg border ${
                              wasReset
                                ? "bg-rose-950/40 border-rose-800/50"
                                : "bg-slate-900/60 border-slate-800/80"
                            }`}
                          >
                            <p className="text-[10px] text-slate-400 font-semibold truncate mb-0.5">
                              {players[pIdx]}
                            </p>
                            <p
                              className={`text-xs font-bold ${
                                delta > 0
                                  ? "text-emerald-400"
                                  : delta < 0
                                  ? "text-rose-400"
                                  : "text-slate-500"
                              }`}
                            >
                              {delta > 0 ? `+${delta}` : delta}
                            </p>
                            <p
                              className={`text-sm font-mono font-black mt-1 ${
                                wasReset ? "text-rose-300" : "text-amber-200"
                              }`}
                            >
                              {totalAfter}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Panduan Singkat Aturan Ceki */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-400 space-y-1.5">
          <p className="font-bold text-slate-300">💡 Aturan Kartu Ceki yang Diterapkan:</p>
          <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
            <li>
              <strong>Batas Aman (&lt; 100):</strong> Jika pemimpin klasemen masih di bawah 100 poin, posisi dapat bertukar tanpa ada reset poin.
            </li>
            <li>
              <strong>Aturan Tersalip (≥ 100):</strong> Jika pemimpin klasemen (skor tertinggi ≥ 100 poin) disalip oleh pemain lain, total skor pemimpin yang tersalip langsung di-reset kembali ke 0.
            </li>
            <li>
              <strong>Target Menang:</strong> Permainan selesai saat ada pemain yang berhasil mencapai atau melebihi 1000 poin.
            </li>
          </ul>
        </section>
      </main>

      {/* Modal Dialog Konfirmasi Reset Game (Desain Modern & Senada UI) */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-[#0d1424] border border-rose-900/60 rounded-3xl p-6 max-w-sm w-full shadow-2xl shadow-rose-950/40 text-center space-y-4">
            {/* Icon Peringatan */}
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500/20 to-red-600/30 border border-rose-500/40 flex items-center justify-center text-2xl shadow-lg shadow-rose-950/50">
              🔄
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-100 tracking-wide uppercase">
                Reset Pertandingan?
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Seluruh perolehan skor ronde dan riwayat permainan akan dikosongkan ke 0. Kamu akan kembali ke layar awal setup nama pemain.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="py-3 px-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 active:scale-[0.98] text-white font-black text-xs rounded-xl shadow-lg shadow-rose-900/40 transition cursor-pointer"
              >
                Ya, Reset Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
