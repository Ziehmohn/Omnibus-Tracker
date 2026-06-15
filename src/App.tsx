/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "./lib/firebase";
import { Item, PriceRecord, ItemWithLatestPrice } from "./types";
import { seedDatabase } from "./services/seedService";
import { CopyPlus, TrendingDown, AlertTriangle, ShieldCheck, ArrowUpDown, ArrowUp, ArrowDown, Search, ExternalLink, X, RefreshCw, LayoutDashboard, Percent, Users, Box, Store } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, YAxis, XAxis, Cell } from "recharts";

export default function App() {
  const [items, setItems] = useState<ItemWithLatestPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  
  const handleManualCrawl = async () => {
    setIsCrawling(true);
    try {
      await fetch('/api/crawl', { method: 'POST' });
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => {
        setIsCrawling(false);
        alert('Der Crawl wurde im Hintergrund gestartet. Dies kann einige Minuten dauern, da viele Produkte überprüft werden. Bitte laden Sie die Seite später neu.');
      }, 500);
    }
  };
  
  const [activeTab, setActiveTab] = useState<"omnibus" | "discount-overview" | "competitors">("omnibus");
  const [openGraphId, setOpenGraphId] = useState<string | null>(null);

  const competitorDetections = [
    { id: '1', brand: 'Kronotex', marketplace: 'Hornbach', activeListings: 50, lastSeen: 'Heute' },
    { id: '2', brand: 'Kronotex', marketplace: 'Praxis', activeListings: 40, lastSeen: 'Heute' },
    { id: '3', brand: 'Kronotex', marketplace: 'OTTO', activeListings: 55, lastSeen: 'Heute' },
    { id: '4', brand: 'Parador', marketplace: 'Hornbach', activeListings: 35, lastSeen: 'Heute' },
    { id: '5', brand: 'Parador', marketplace: 'OTTO', activeListings: 54, lastSeen: 'Heute' },
    { id: '6', brand: 'Meister', marketplace: 'Hornbach', activeListings: 120, lastSeen: 'Gestern' },
    { id: '7', brand: 'Meister', marketplace: 'Praxis', activeListings: 90, lastSeen: 'Gestern' },
    { id: '8', brand: 'Tarkett', marketplace: 'Praxis', activeListings: 20, lastSeen: 'Heute' },
    { id: '9', brand: 'Tarkett', marketplace: 'Obi', activeListings: 25, lastSeen: 'Heute' },
    { id: '10', brand: 'Kaindl', marketplace: 'OTTO', activeListings: 120, lastSeen: 'Heute' },
    { id: '11', brand: 'Classen', marketplace: 'Hornbach', activeListings: 60, lastSeen: 'Gestern' },
  ];

  const [competitorGroupBy, setCompetitorGroupBy] = useState<"platform" | "brand">("platform");
  const [competitorFilter, setCompetitorFilter] = useState("all");

  const competitorUniqueBrands = Array.from(new Set(competitorDetections.map(d => d.brand))).sort();
  const competitorUniquePlatforms = Array.from(new Set(competitorDetections.map(d => d.marketplace))).sort();

  const filteredDetections = useMemo(() => {
    return competitorDetections.filter(d => {
      if (competitorFilter === 'all') return true;
      if (competitorGroupBy === 'platform') {
        return d.marketplace === competitorFilter;
      } else {
        return d.brand === competitorFilter;
      }
    });
  }, [competitorFilter, competitorGroupBy]);

  const groupedCompetitors = useMemo(() => {
    const map = new Map();
    filteredDetections.forEach(d => {
      const gThis = competitorGroupBy === 'platform' ? d.marketplace : d.brand;
      const gThat = competitorGroupBy === 'platform' ? d.brand : d.marketplace;
      
      if (!map.has(gThis)) {
        map.set(gThis, { name: gThis, children: [], totalListings: 0 });
      }
      const group = map.get(gThis);
      group.children.push({ name: gThat, ...d });
      group.totalListings += d.activeListings;
    });
    return Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name));
  }, [filteredDetections, competitorGroupBy]);

  const [filterMarketplace, setFilterMarketplace] = useState("");
  const [filterProductset, setFilterProductset] = useState("all-productsets");

  const marketplaces = useMemo(() => {
    const list = Array.from(new Set(items.map(i => i.marketplace).filter(Boolean))) as string[];
    return list.sort();
  }, [items]);

  useEffect(() => {
    if (marketplaces.length > 0 && !marketplaces.includes(filterMarketplace)) {
      setFilterMarketplace(marketplaces[0]);
    }
  }, [marketplaces, filterMarketplace]);

  const productsets = useMemo(() => {
    const list = Array.from(new Set(items.map(i => i.productset).filter(Boolean))) as string[];
    return list.sort();
  }, [items]);

  const displayedMarketplaces = [filterMarketplace].filter(Boolean);
  
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
      if (item.marketplace !== filterMarketplace) return false;
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

  const discountOverviewItems = useMemo(() => {
    const grouped = new Map<string, {
      name: string;
      productset: string;
      marketplaces: Record<string, {
        strikethroughPrice: number | null | undefined;
        currentPrice: number | null | undefined;
        discountPercentage: number | null | undefined;
        url: string;
      }>;
    }>();

    items.forEach(item => {
      // Apply productset filter if needed
      if (filterProductset !== "all-productsets" && item.productset !== filterProductset) return;

      const latest = item.latestRecord;
      if (!grouped.has(item.name)) {
        grouped.set(item.name, {
          name: item.name,
          productset: item.productset,
          marketplaces: {}
        });
      }

      grouped.get(item.name)!.marketplaces[item.marketplace] = {
        strikethroughPrice: latest?.strikethroughPrice,
        currentPrice: latest?.currentPrice,
        discountPercentage: latest?.discountPercentage,
        url: item.url
      };
    });

    return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, filterProductset]);

  const violationsCount = processedItems.filter(i => i.latestRecord?.isViolation).length;

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col hidden md:flex shrink-0">
        <div className="p-4 bg-slate-950 flex items-center gap-3">
          <img src="https://cdn.egger.com/img/cms/ff58d5b2-cb11-41dc-ba72-5cec737f1c8a/def606a7-b410-40af-bc8a-34a5e12bf3ca/ORIGINAL/gen_egger_logo_de.svg" alt="EGGER" className="h-5 brightness-0 invert" />
          <span className="font-bold text-white tracking-tight">E-Com Dashboard</span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <div className="px-4 mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Discount Tracking</p>
          </div>
          <nav className="space-y-1 px-2">
            <button 
              onClick={() => setActiveTab('omnibus')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'omnibus' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <TrendingDown className="w-4 h-4" />
              Omnibus tracking
            </button>
            <button 
              onClick={() => setActiveTab('discount-overview')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'discount-overview' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Percent className="w-4 h-4" />
              Discount overview
            </button>
          </nav>

          <div className="px-4 mt-8 mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Market Analysis</p>
          </div>
          <nav className="space-y-1 px-2">
            <button 
              onClick={() => setActiveTab('competitors')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'competitors' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Users className="w-4 h-4" />
              Competitors
            </button>
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-200 shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-slate-800 tracking-tight">
              {activeTab === 'omnibus' && 'Omnibus tracking'}
              {activeTab === 'discount-overview' && 'Discount overview'}
              {activeTab === 'competitors' && 'Competitors'}
            </h2>
            
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 hidden sm:inline-flex items-center gap-1">
                <TrendingDown className="w-4 h-4" />
                Preiscrawl erfolgt täglich um 8 Uhr
              </span>
              <button
                onClick={handleManualCrawl}
                disabled={isCrawling}
                className="ml-2 inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isCrawling ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
                Manuell anstoßen
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-50 p-4 sm:p-6 lg:p-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 text-slate-400">
              <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin mb-4" />
              <p>Loading overview data...</p>
            </div>
          ) : activeTab === 'competitors' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Active Platforms</p>
                    <p className="text-3xl font-bold mt-1 text-slate-900">{competitorUniquePlatforms.length}</p>
                  </div>
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full">
                    <Store className="w-6 h-6" />
                  </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Tracked Brands</p>
                    <p className="text-3xl font-bold mt-1 text-slate-900">{competitorUniqueBrands.length}</p>
                  </div>
                  <div className="p-3 bg-slate-100 text-slate-600 rounded-full">
                    <Users className="w-6 h-6" />
                  </div>
                </div>
              </div>

              <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm gap-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                  Competitor Analysis
                </h2>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <div className="flex border border-slate-300 rounded-md overflow-hidden bg-slate-100 p-0.5">
                    <button
                      className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${competitorGroupBy === 'platform' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      onClick={() => { setCompetitorGroupBy('platform'); setCompetitorFilter('all'); }}
                    >
                      Group by Platform
                    </button>
                    <button
                      className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${competitorGroupBy === 'brand' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      onClick={() => { setCompetitorGroupBy('brand'); setCompetitorFilter('all'); }}
                    >
                      Group by Brand
                    </button>
                  </div>
                  
                  <select 
                    className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                    value={competitorFilter}
                    onChange={(e) => setCompetitorFilter(e.target.value)}
                  >
                    <option value="all">All {competitorGroupBy === 'platform' ? 'Platforms' : 'Brands'}</option>
                    {(competitorGroupBy === 'platform' ? competitorUniquePlatforms : competitorUniqueBrands).map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="bg-white border rounded-lg overflow-x-auto border-slate-200 shadow-sm w-full">
                <table className="w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        {competitorGroupBy === 'platform' ? 'Platform' : 'Brand / Competitor'}
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        {competitorGroupBy === 'platform' ? 'Detected Brands' : 'Active Platforms'}
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Total Identified Products
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {groupedCompetitors.map((group) => (
                      <tr key={group.name} className="hover:bg-slate-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          {group.name}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          <div className="flex flex-wrap gap-2">
                             {group.children.map((child: any) => (
                               <span key={child.id} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 hover:bg-slate-200 cursor-default">
                                 {child.name}
                                 <span className="text-slate-400">({child.activeListings})</span>
                               </span>
                             ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 text-right font-medium">
                          {group.totalListings}
                        </td>
                      </tr>
                    ))}
                    {groupedCompetitors.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-sm text-slate-500">
                          No results found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'omnibus' && (
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
                      <p className="text-sm font-medium text-slate-500">Violations</p>
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
              )}

              <div className="mb-6 flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                  {activeTab === 'omnibus' ? 'Omnibus Products List' : 'Discount Übersicht'}
                </h2>
                <div className="flex gap-4">
                  {activeTab === 'omnibus' && (
                    <select 
                      className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white font-medium capitalize outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                      value={filterMarketplace}
                      onChange={(e) => setFilterMarketplace(e.target.value)}
                    >
                      {marketplaces.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  )}
                  <select 
                    className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white font-medium capitalize outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                    value={filterProductset}
                    onChange={(e) => setFilterProductset(e.target.value)}
                  >
                    <option value="all-productsets">All Productsets</option>
                    {productsets.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {activeTab === 'omnibus' ? (
                <div className="bg-white border rounded-lg overflow-x-auto border-slate-200 shadow-sm w-full">
                  <table className="w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-2 py-2 text-left w-24 align-top">
                      <div className="flex flex-col h-16 justify-between items-start">
                        <button onClick={() => handleSort('erfasst')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none">Hinzugefügt am {getSortIcon('erfasst')}</button>
                      </div>
                    </th>
                    <th scope="col" className="px-2 py-2 text-left align-top max-w-[200px]">
                      <div className="flex flex-col h-16 justify-between items-start w-full">
                        <button onClick={() => handleSort('name')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none">Artikelname {getSortIcon('name')}</button>
                        <input type="text" placeholder="Suche..." className="w-full text-xs border border-slate-300 rounded px-2 py-1 shadow-sm font-normal min-w-[120px]" value={columnFilters.name} onChange={e => updateColumnFilter('name', e.target.value)} />
                      </div>
                    </th>
                    <th scope="col" className="px-2 py-2 text-left align-top w-28">
                      <div className="flex flex-col h-16 justify-between items-start">
                        <button onClick={() => handleSort('marketplace')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none">Marktplatz {getSortIcon('marketplace')}</button>
                      </div>
                    </th>
                    <th scope="col" className="px-2 py-2 text-right group/th align-top">
                      <div className="flex flex-col h-16 justify-between items-end">
                        <button onClick={() => handleSort('regularPrice')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none">Reg. Preis {getSortIcon('regularPrice')}</button>
                        <div className="flex justify-end gap-1">
                          <select className="text-xs border border-slate-300 rounded shadow-sm font-normal bg-white" value={columnFilters.regularPriceOp} onChange={e => updateColumnFilter('regularPriceOp', e.target.value)}>
                            <option value="=">=</option>
                            <option value=">">&gt;</option>
                            <option value="<">&lt;</option>
                          </select>
                          <input type="text" placeholder="Wert" className="w-12 text-xs border border-slate-300 rounded px-1 py-1 shadow-sm font-normal text-right" value={columnFilters.regularPriceVal} onChange={e => updateColumnFilter('regularPriceVal', e.target.value)} />
                        </div>
                      </div>
                    </th>
                    {displayedMarketplaces.map(marketplace => (
                      <th key={`th-${marketplace}`} scope="col" className="px-2 py-2 text-right group/th align-top">
                        <div className="flex flex-col h-16 justify-between items-end">
                          <button onClick={() => handleSort('currentPrice')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none">Preis ({marketplace}) {getSortIcon('currentPrice')}</button>
                          <div className="flex justify-end gap-1">
                            <select className="text-xs border border-slate-300 rounded shadow-sm font-normal bg-white" value={columnFilters.currentPriceOp} onChange={e => updateColumnFilter('currentPriceOp', e.target.value)}>
                              <option value="=">=</option>
                              <option value=">">&gt;</option>
                              <option value="<">&lt;</option>
                            </select>
                            <input type="text" placeholder="Wert" className="w-12 text-xs border border-slate-300 rounded px-1 py-1 shadow-sm font-normal text-right" value={columnFilters.currentPriceVal} onChange={e => updateColumnFilter('currentPriceVal', e.target.value)} />
                          </div>
                        </div>
                      </th>
                    ))}
                    <th scope="col" className="px-2 py-2 text-right group/th align-top">
                      <div className="flex flex-col h-16 justify-between items-end">
                        <button onClick={() => handleSort('discount')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none">Discount {getSortIcon('discount')}</button>
                        <div className="flex justify-end gap-1">
                          <select className="text-xs border border-slate-300 rounded shadow-sm font-normal bg-white" value={columnFilters.discountOp} onChange={e => updateColumnFilter('discountOp', e.target.value)}>
                            <option value="=">=</option>
                            <option value=">">&gt;</option>
                            <option value="<">&lt;</option>
                          </select>
                          <input type="text" placeholder="%" className="w-10 text-xs border border-slate-300 rounded px-1 py-1 shadow-sm font-normal text-right" value={columnFilters.discountVal} onChange={e => updateColumnFilter('discountVal', e.target.value)} />
                        </div>
                      </div>
                    </th>
                    <th scope="col" className="px-2 py-2 text-right align-top">
                      <div className="flex flex-col h-16 justify-between items-end">
                        <button onClick={() => handleSort('validSince')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none whitespace-nowrap">Gültig seit {getSortIcon('validSince')}</button>
                      </div>
                    </th>
                    <th scope="col" className="px-2 py-2 text-center w-28 align-top">
                      <div className="flex flex-col h-16 justify-between items-center">
                        <button onClick={() => handleSort('fazit')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none">Fazit {getSortIcon('fazit')}</button>
                        <div className="flex flex-col items-start text-[10px] leading-tight font-normal text-slate-600 gap-0.5 mx-auto w-max bg-white p-1 rounded border border-slate-200">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" checked={columnFilters.fazitCompliant as any} onChange={e => updateColumnFilter('fazitCompliant', e.target.checked as any)} className="rounded text-blue-600 border-slate-300 focus:ring-blue-500 w-3 h-3" />
                            Compliant
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" checked={columnFilters.fazitViolation as any} onChange={e => updateColumnFilter('fazitViolation', e.target.checked as any)} className="rounded text-blue-600 border-slate-300 focus:ring-blue-500 w-3 h-3" />
                            Violation
                          </label>
                        </div>
                      </div>
                    </th>
                    <th scope="col" className="px-2 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-16 align-top">
                      <div className="flex flex-col h-16 justify-between items-end">
                        <span>Graph</span>
                      </div>
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
                        <td className="px-2 py-2 whitespace-nowrap text-sm text-slate-500">
                           {item.history.length > 0 ? new Date(item.history[item.history.length - 1].date || 1715126400000).toLocaleDateString('de-DE') : "-"}
                        </td>
                        <td className="px-2 py-2 text-sm text-slate-900 transition-colors">
                          <div className="flex items-center gap-2 max-w-[200px]">
                            <span className="line-clamp-1 truncate" title={item.name}>
                              {item.name}
                            </span>
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600 shrink-0" title={`Auf ${item.marketplace} ansehen`}>
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-sm text-slate-500 text-left capitalize truncate max-w-[100px]" title={item.marketplace}>
                          {item.marketplace}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-sm text-slate-500 text-right">
                          {latest?.strikethroughPrice ? `€ ${latest.strikethroughPrice.toFixed(2)}` : "-"}
                        </td>
                        {displayedMarketplaces.map(marketplace => (
                          <td key={`td-${marketplace}`} className="px-2 py-2 whitespace-nowrap text-sm font-medium text-slate-900 text-right">
                            {item.marketplace === marketplace ? (latest ? `€ ${latest.currentPrice.toFixed(2)}` : "-") : "-"}
                          </td>
                        ))}
                        <td className="px-2 py-2 whitespace-nowrap text-sm text-slate-500 text-right">
                          {latest?.discountPercentage ? <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-xs font-medium">-{latest.discountPercentage}%</span> : "-"}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-sm text-slate-500 text-right">
                          {(() => {
                            if (!latest) return "-";
                            
                            let validSinceDate: Date | null = null;
                            if (latest.discountStartDate) {
                                validSinceDate = new Date(latest.discountStartDate);
                            } else {
                                const earliestStr = item.history.reduce((earliest: number, r: any) => {
                                    if (r.currentPrice === latest.currentPrice) {
                                        return r.date < earliest ? r.date : earliest;
                                    }
                                    return earliest;
                                }, Number.MAX_SAFE_INTEGER);
                                
                                if (earliestStr !== Number.MAX_SAFE_INTEGER) {
                                    validSinceDate = new Date(earliestStr);
                                }
                            }
                            
                            if (validSinceDate) {
                                const todayDate = new Date();
                                const diffTime = Date.UTC(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()) - 
                                                 Date.UTC(validSinceDate.getFullYear(), validSinceDate.getMonth(), validSinceDate.getDate());
                                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                                return (
                                  <div className="flex flex-col items-end">
                                    <span>{validSinceDate.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'})}</span>
                                    <span className="text-xs text-slate-400">({diffDays} Tage)</span>
                                  </div>
                                );
                            }
                            return <span className="text-slate-400 block w-full">-</span>;
                          })()}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-center">
                          {latest?.isViolation ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Violation
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                              Compliant
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-right text-sm font-medium relative">
                           <div className="relative inline-block">
                              <button onClick={() => setOpenGraphId(item.id)} className="text-slate-400 hover:text-blue-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-blue-50">
                                <TrendingDown className="w-5 h-5" />
                              </button>
                              {openGraphId === item.id && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setOpenGraphId(null)}></div>
                                  <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 w-72 bg-white border border-slate-200 rounded-lg shadow-xl p-4 z-20">
                                    <button onClick={() => setOpenGraphId(null)} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 rounded">
                                      <X className="w-4 h-4" />
                                    </button>
                                    <h4 className="text-xs font-semibold text-slate-500 mb-2 pr-6 text-left">Price History</h4>
                                    <div className="h-40 w-full">
                                        <LineChart width={250} height={150} data={[...item.history].reverse().map(r => ({
                                          date: new Date(r.date || 0).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' }),
                                          price: r.currentPrice
                                        }))} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                          <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                                          <RechartsTooltip contentStyle={{fontSize: '12px'}} formatter={(val: number) => [`€${val.toFixed(2)}`, 'Preis']} />
                                          <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                        </LineChart>
                                    </div>
                                  </div>
                                </>
                              )}
                           </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            ) : (
              <div className="bg-white border rounded-lg overflow-x-auto border-slate-200 shadow-sm">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-2 py-2 text-left w-20 text-xs font-medium text-slate-500 uppercase tracking-wider">Lfd. Nr.</th>
                      <th scope="col" className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Artikelname</th>
                      {marketplaces.map(marketplace => (
                        <th key={marketplace} scope="col" className="px-2 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider capitalize">{marketplace}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {discountOverviewItems.length === 0 ? (
                      <tr>
                        <td colSpan={marketplaces.length + 2} className="px-6 py-10 text-center text-slate-500">
                          Keine Artikel gefunden, die den Filterkriterien entsprechen.
                        </td>
                      </tr>
                    ) : discountOverviewItems.map((group, idx) => (
                      <tr key={group.name} className="hover:bg-slate-50">
                        <td className="px-2 py-2 whitespace-nowrap text-sm text-slate-500">{idx + 1}</td>
                        <td className="px-2 py-2 text-sm font-medium text-slate-900 border-r border-slate-100">
                          <div className="line-clamp-1 truncate max-w-[300px]" title={group.name}>{group.name}</div>
                        </td>
                        {marketplaces.map(marketplace => {
                          const mData = group.marketplaces[marketplace];
                          return (
                            <td key={marketplace} className="px-2 py-2 whitespace-nowrap border-r border-slate-100 text-center">
                              {mData?.discountPercentage ? (
                                <a href={mData.url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 text-emerald-600 hover:opacity-80 transition-opacity" title={`Auf ${marketplace} ansehen`}>
                                  <ShieldCheck className="w-5 h-5 mx-auto" aria-label="Discount active" />
                                  <span className="text-xs font-bold text-slate-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">-{mData.discountPercentage}% <ExternalLink className="w-3 h-3 text-slate-400" /></span>
                                </a>
                              ) : mData ? (
                                <a href={mData.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600 transition-colors inline-block" title={`Auf ${marketplace} ansehen`}>
                                  <span className="font-bold">-</span>
                                  <ExternalLink className="w-3 h-3 inline-block ml-1" />
                                </a>
                              ) : (
                                <span className="text-slate-400 font-bold">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        </main>
      </div>
    </div>
  );
}
