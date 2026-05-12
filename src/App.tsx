/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "./lib/firebase";
import { Item, PriceRecord, ItemWithLatestPrice } from "./types";
import { seedDatabase } from "./services/seedService";
import { CopyPlus, TrendingDown, AlertTriangle, ShieldCheck, ArrowUpDown, ArrowUp, ArrowDown, Search, ExternalLink } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, Tooltip as RechartsTooltip, YAxis, XAxis, Cell } from "recharts";

export default function App() {
  const [items, setItems] = useState<ItemWithLatestPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  
  const [filterMarketplace, setFilterMarketplace] = useState("all-marketplaces");
  const [filterProductset, setFilterProductset] = useState("all-productsets");
  
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [columnFilters, setColumnFilters] = useState({
    name: "",
    regularPriceOp: "=",
    regularPriceVal: "",
    currentPriceOp: "=",
    currentPriceVal: "",
    discountOp: "=",
    discountVal: "",
    fazitCompliant: true,
    fazitViolation: true
  });

  const loadData = async () => {
    try {
      const itemsSnapshot = await getDocs(collection(db, "items"));
      const itemsList: ItemWithLatestPrice[] = [];

      for (const docSnap of itemsSnapshot.docs) {
        const itemData = docSnap.data() as Item;
        itemData.id = docSnap.id;

        // Fetch records
        const recordsQuery = query(
          collection(db, `items/${docSnap.id}/priceRecords`),
          orderBy("date", "desc")
        );
        const recordsSnapshot = await getDocs(recordsQuery);
        
        const history = recordsSnapshot.docs.map(r => ({
          ...r.data(),
          id: r.id,
          date: r.data().date?.toMillis ? r.data().date.toMillis() : (r.data().date?.seconds * 1000 || r.data().date),
          discountStartDate: r.data().discountStartDate?.toMillis ? r.data().discountStartDate.toMillis() : (r.data().discountStartDate?.seconds * 1000 || r.data().discountStartDate),
        })) as PriceRecord[];

        const latestRecord = history.length > 0 ? history[0] : null;

        itemsList.push({
          ...itemData,
          history,
          latestRecord,
        });
      }

      setItems(itemsList);
    } catch (error) {
      console.error("Failed to load data", error);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await loadData();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return <ArrowUpDown className="w-3 h-3 ml-1 inline text-slate-400" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-3 h-3 ml-1 inline text-slate-900" />
      : <ArrowDown className="w-3 h-3 ml-1 inline text-slate-900" />;
  };

  const updateColumnFilter = (col: keyof typeof columnFilters, val: string) => {
    setColumnFilters(prev => ({ ...prev, [col]: val }));
  };

  const processedItems = useMemo(() => {
    let result = items.filter(item => {
      if (filterMarketplace !== "all-marketplaces" && item.marketplace !== filterMarketplace) return false;
      if (filterProductset !== "all-productsets" && item.productset !== filterProductset) return false;
      
      const latest = item.latestRecord;
      const nameStr = item.name || "";

      if (columnFilters.name && !nameStr.toLowerCase().includes(columnFilters.name.toLowerCase())) return false;
      
      const checkNumericFilter = (val: number | undefined | null, op: string, filterVal: string) => {
        if (!filterVal) return true;
        if (val == null) return false;
        const num = parseFloat(filterVal.replace(',', '.'));
        if (isNaN(num)) return true;
        if (op === '>') return val > num;
        if (op === '<') return val < num;
        return val === num;
      };

      if (!checkNumericFilter(latest?.strikethroughPrice, columnFilters.regularPriceOp, columnFilters.regularPriceVal)) return false;
      if (!checkNumericFilter(latest?.currentPrice, columnFilters.currentPriceOp, columnFilters.currentPriceVal)) return false;
      if (!checkNumericFilter(latest?.discountPercentage, columnFilters.discountOp, columnFilters.discountVal)) return false;

      const isViolation = !!latest?.isViolation;
      if (isViolation && !columnFilters.fazitViolation) return false;
      if (!isViolation && !columnFilters.fazitCompliant) return false;

      return true;
    });

    if (sortConfig) {
      result.sort((a, b) => {
        const latestA = a.latestRecord;
        const latestB = b.latestRecord;

        let valA: any;
        let valB: any;

        switch (sortConfig.key) {
          case 'erfasst':
            valA = a.history.length > 0 ? (a.history[a.history.length - 1].date || 0) : 0;
            valB = b.history.length > 0 ? (b.history[b.history.length - 1].date || 0) : 0;
            break;
          case 'name':
            valA = a.name;
            valB = b.name;
            break;
          case 'regularPrice':
            valA = latestA?.strikethroughPrice || 0;
            valB = latestB?.strikethroughPrice || 0;
            break;
          case 'currentPrice':
            valA = latestA?.currentPrice || 0;
            valB = latestB?.currentPrice || 0;
            break;
          case 'discount':
            valA = latestA?.discountPercentage || 0;
            valB = latestB?.discountPercentage || 0;
            break;
          case 'validSince':
            valA = latestA?.discountStartDate || 0;
            valB = latestB?.discountStartDate || 0;
            break;
          case 'fazit':
            valA = latestA?.isViolation ? 0 : 1; // Violation first if Asc
            valB = latestB?.isViolation ? 0 : 1;
            break;
          default:
            return 0;
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [items, filterMarketplace, filterProductset, columnFilters, sortConfig]);

  const violationsCount = processedItems.filter(i => i.latestRecord?.isViolation).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="https://cdn.egger.com/img/cms/ff58d5b2-cb11-41dc-ba72-5cec737f1c8a/def606a7-b410-40af-bc8a-34a5e12bf3ca/ORIGINAL/gen_egger_logo_de.svg" alt="EGGER Logo" className="h-6" />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight border-l border-slate-300 pl-4">Omnibus Tracker</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 hidden sm:inline-flex items-center gap-1">
              <TrendingDown className="w-4 h-4" />
              Preiscrawl erfolgt täglich um 8 Uhr
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 text-slate-400">
            <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin mb-4" />
            <p>Loading competitor data...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Tracked Items</p>
                  <p className="text-3xl font-bold mt-1">{processedItems.length}</p>
                </div>
                <div className="p-3 bg-slate-100 text-slate-600 rounded-full">
                  <TrendingDown className="w-6 h-6" />
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Omnibus Violations</p>
                  <p className="text-3xl font-bold mt-1 text-red-600">{violationsCount}</p>
                </div>
                <div className="p-3 bg-red-50 text-red-600 rounded-full">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Compliant Items</p>
                  <p className="text-3xl font-bold mt-1 text-emerald-600">{processedItems.length - violationsCount}</p>
                </div>
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full">
                  <ShieldCheck className="w-6 h-6" />
                </div>
              </div>
            </div>

            <div className="mb-6 flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Competitor Products List
              </h2>
              <div className="flex gap-4">
                <select 
                  className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white font-medium" 
                  value={filterMarketplace}
                  onChange={(e) => setFilterMarketplace(e.target.value)}
                >
                  <option value="all-marketplaces">All Marketplaces</option>
                  <option value="Praxis">Praxis</option>
                </select>
                <select 
                  className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white font-medium" 
                  value={filterProductset}
                  onChange={(e) => setFilterProductset(e.target.value)}
                >
                  <option value="all-productsets">All Productsets</option>
                  <option value="Yarenza">Yarenza</option>
                </select>
              </div>
            </div>
            
            <div className="bg-white border rounded-lg overflow-x-auto border-slate-200 shadow-sm">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left w-32">
                      <button onClick={() => handleSort('erfasst')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none">Erfasst seit {getSortIcon('erfasst')}</button>
                    </th>
                    <th scope="col" className="px-6 py-3 text-left">
                      <button onClick={() => handleSort('name')} className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-2 flex items-center hover:text-slate-900 focus:outline-none">Artikelname {getSortIcon('name')}</button>
                      <input type="text" placeholder="Suche..." className="w-full text-xs border-slate-300 rounded px-2 py-1 shadow-sm font-normal" value={columnFilters.name} onChange={e => updateColumnFilter('name', e.target.value)} />
                    </th>
                    <th scope="col" className="px-6 py-3 text-right group/th">
                      <button onClick={() => handleSort('regularPrice')} className="text-xs font-medium text-slate-600 uppercase tracking-wider justify-end w-full mb-2 flex items-center hover:text-slate-900 focus:outline-none">Regulärer Preis {getSortIcon('regularPrice')}</button>
                      <div className="flex justify-end gap-1 float-right">
                        <select className="text-xs border-slate-300 rounded shadow-sm font-normal bg-white" value={columnFilters.regularPriceOp} onChange={e => updateColumnFilter('regularPriceOp', e.target.value)}>
                          <option value="=">=</option>
                          <option value=">">&gt;</option>
                          <option value="<">&lt;</option>
                        </select>
                        <input type="text" placeholder="Wert" className="w-14 text-xs border-slate-300 rounded px-2 py-1 shadow-sm font-normal text-right" value={columnFilters.regularPriceVal} onChange={e => updateColumnFilter('regularPriceVal', e.target.value)} />
                      </div>
                    </th>
                    <th scope="col" className="px-6 py-3 text-right group/th">
                      <button onClick={() => handleSort('currentPrice')} className="text-xs font-medium text-slate-600 uppercase tracking-wider justify-end w-full mb-2 flex items-center hover:text-slate-900 focus:outline-none">Aktueller Preis {getSortIcon('currentPrice')}</button>
                      <div className="flex justify-end gap-1 float-right">
                        <select className="text-xs border-slate-300 rounded shadow-sm font-normal bg-white" value={columnFilters.currentPriceOp} onChange={e => updateColumnFilter('currentPriceOp', e.target.value)}>
                          <option value="=">=</option>
                          <option value=">">&gt;</option>
                          <option value="<">&lt;</option>
                        </select>
                        <input type="text" placeholder="Wert" className="w-14 text-xs border-slate-300 rounded px-2 py-1 shadow-sm font-normal text-right" value={columnFilters.currentPriceVal} onChange={e => updateColumnFilter('currentPriceVal', e.target.value)} />
                      </div>
                    </th>
                    <th scope="col" className="px-6 py-3 text-right group/th">
                      <button onClick={() => handleSort('discount')} className="text-xs font-medium text-slate-600 uppercase tracking-wider justify-end w-full mb-2 flex items-center hover:text-slate-900 focus:outline-none">Discount {getSortIcon('discount')}</button>
                      <div className="flex justify-end gap-1 float-right">
                        <select className="text-xs border-slate-300 rounded shadow-sm font-normal bg-white" value={columnFilters.discountOp} onChange={e => updateColumnFilter('discountOp', e.target.value)}>
                          <option value="=">=</option>
                          <option value=">">&gt;</option>
                          <option value="<">&lt;</option>
                        </select>
                        <input type="text" placeholder="%" className="w-12 text-xs border-slate-300 rounded px-2 py-1 shadow-sm font-normal text-right" value={columnFilters.discountVal} onChange={e => updateColumnFilter('discountVal', e.target.value)} />
                      </div>
                    </th>
                    <th scope="col" className="px-6 py-3 text-right w-40">
                      <button onClick={() => handleSort('validSince')} className="text-xs font-medium text-slate-600 uppercase tracking-wider justify-end w-full flex items-center hover:text-slate-900 focus:outline-none whitespace-nowrap">Gültig seit (Tage) {getSortIcon('validSince')}</button>
                    </th>
                    <th scope="col" className="px-6 py-3 text-center">
                      <button onClick={() => handleSort('fazit')} className="text-xs font-medium text-slate-600 uppercase tracking-wider justify-center w-full mb-2 flex items-center hover:text-slate-900 focus:outline-none">Fazit {getSortIcon('fazit')}</button>
                      <div className="flex flex-col items-start text-xs font-normal text-slate-600 gap-1 mx-auto w-max bg-white p-1 rounded">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={columnFilters.fazitCompliant as any} onChange={e => updateColumnFilter('fazitCompliant', e.target.checked as any)} className="rounded text-blue-600 border-slate-300 focus:ring-blue-500" />
                          Compliant
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={columnFilters.fazitViolation as any} onChange={e => updateColumnFilter('fazitViolation', e.target.checked as any)} className="rounded text-blue-600 border-slate-300 focus:ring-blue-500" />
                          Violation
                        </label>
                      </div>
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Graph
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {processedItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-slate-500">
                        Keine Artikel gefunden, die den Filterkriterien entsprechen.
                      </td>
                    </tr>
                  ) : processedItems.map(item => {
                    const latest = item.latestRecord;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 group">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                           {item.history.length > 0 ? new Date(item.history[item.history.length - 1].date || 1715126400000).toLocaleDateString('de-DE') : "-"}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-900 transition-colors">
                          <div className="flex items-center gap-2 max-w-sm">
                            <span className="line-clamp-2" title={item.name}>
                              {item.name}
                            </span>
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600 shrink-0" title="Auf Praxis.nl ansehen">
                               <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                          {latest?.strikethroughPrice ? `€ ${latest.strikethroughPrice.toFixed(2)}` : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 text-right">
                          € {latest?.currentPrice.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                          {latest?.discountPercentage ? <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-xs font-medium">-{latest.discountPercentage}%</span> : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                          {(() => {
                            if (!latest) return "-";
                            const earliestStr = item.history.reduce((earliest, r) => {
                                if (r.currentPrice === latest.currentPrice) {
                                    return r.date < earliest ? r.date : earliest;
                                }
                                return earliest;
                            }, Number.MAX_SAFE_INTEGER);
                            
                            if (earliestStr !== Number.MAX_SAFE_INTEGER) {
                                const validSinceDate = new Date(earliestStr);
                                const diffTime = Math.abs(new Date().getTime() - validSinceDate.getTime());
                                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                                return (
                                  <div className="flex flex-col items-end">
                                    <span>{validSinceDate.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'})}</span>
                                    <span className="text-xs text-slate-400">({diffDays} Tage)</span>
                                  </div>
                                );
                            }
                            return "08.05.2026";
                          })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {latest?.isViolation ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Omnibus Violation
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                              Omnibus Compliant
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium relative">
                           <div className="relative inline-block group/graph">
                              <button className="text-slate-400 hover:text-blue-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-blue-50">
                                <TrendingDown className="w-5 h-5" />
                              </button>
                              <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 w-72 bg-white border border-slate-200 rounded-lg shadow-xl p-4 hidden group-hover/graph:block z-20">
                                <h4 className="text-xs font-semibold text-slate-500 mb-2">Price History (Last 4 Days)</h4>
                                <div className="h-40 w-full">
                                    <BarChart width={250} height={150} data={[...item.history].reverse().map(r => ({
                                      date: new Date(r.date || 0).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' }),
                                      price: r.currentPrice
                                    }))} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                      <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                      <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fontSize: 10 }} />
                                      <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{fontSize: '12px'}} formatter={(val: number) => [`€${val.toFixed(2)}`, 'Preis']} />
                                      <Bar dataKey="price" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                                        {item.history.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill="#3b82f6" />
                                        ))}
                                      </Bar>
                                    </BarChart>
                                </div>
                              </div>
                           </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
