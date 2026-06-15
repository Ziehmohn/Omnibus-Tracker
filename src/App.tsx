/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "./lib/firebase";
import { Item, PriceRecord, ItemWithLatestPrice } from "./types";
import { seedDatabase } from "./services/seedService";
import { CopyPlus, TrendingDown, AlertTriangle, ShieldCheck, ArrowUpDown, ArrowUp, ArrowDown, Search, ExternalLink, X, RefreshCw, LayoutDashboard, Percent, Users, Box, Store, Settings2, Columns, Download } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, YAxis, XAxis, Cell, ReferenceArea, CartesianGrid } from "recharts";

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
  
  const [activeTab, setActiveTab] = useState<"omnibus" | "discount-overview" | "competitors" | "upload">("omnibus");
  const [openGraphId, setOpenGraphId] = useState<string | null>(null);

  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    erfasst: true,
    name: true,
    marketplace: true,
    regularPrice: true,
    currentPrice: true,
    discount: true,
    validSince: true,
    fazit: true,
    graph: true
  });
  const [showColMenu, setShowColMenu] = useState(false);

  const startResize = (colName: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const th = (e.target as HTMLElement).closest('th');
    const startWidth = th?.offsetWidth || 100;
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(50, startWidth + (moveEvent.clientX - startX));
      setColWidths(prev => ({ ...prev, [colName]: newWidth }));
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };


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
          orderBy("date", "asc")
        );
        const recordsSnapshot = await getDocs(recordsQuery);
        
        const historyAsc = recordsSnapshot.docs.map(r => ({
          ...r.data(),
          id: r.id,
          date: r.data().date?.toMillis ? r.data().date.toMillis() : (r.data().date?.seconds * 1000 || r.data().date),
          discountStartDate: r.data().discountStartDate?.toMillis ? r.data().discountStartDate.toMillis() : (r.data().discountStartDate?.seconds * 1000 || r.data().discountStartDate),
        })) as PriceRecord[];

        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const firstDateMs = historyAsc.length > 0 ? historyAsc[0].date : 0;

        for (let i = 0; i < historyAsc.length; i++) {
           const record = historyAsc[i];
           let isViolation = false;
           let lowestInPrior30: number | undefined = undefined;
           
           const has30DaysHistory = (record.date - firstDateMs) >= thirtyDaysMs;

           const thirtyDaysAgo = record.date - thirtyDaysMs;
           const thirtyDayPrices = [];
           for (let j = 0; j < i; j++) {
               if (historyAsc[j].date >= thirtyDaysAgo) {
                   if (historyAsc[j].currentPrice !== null && historyAsc[j].currentPrice !== undefined) {
                       thirtyDayPrices.push(historyAsc[j].currentPrice);
                   }
               }
           }
           if (thirtyDayPrices.length > 0) {
               lowestInPrior30 = Math.min(...thirtyDayPrices);
           }
           
           if (record.strikethroughPrice && record.strikethroughPrice > record.currentPrice) {
               if (has30DaysHistory && lowestInPrior30 !== undefined && record.strikethroughPrice > lowestInPrior30) {
                   isViolation = true;
               }
           }
           record.isViolation = isViolation;
           (record as any)._lowestPrior30 = lowestInPrior30;
           (record as any)._has30DaysHistory = has30DaysHistory;
        }

        const history = [...historyAsc].reverse();
        const latestRecord = history.length > 0 ? history[0] : null;

        let lowest30DayPrice: number | undefined;
        let has30DaysHistory = false;
        if (latestRecord) {
           lowest30DayPrice = (latestRecord as any)._lowestPrior30;
           has30DaysHistory = (latestRecord as any)._has30DaysHistory;
        }

        itemsList.push({
          ...itemData,
          history,
          latestRecord,
          lowest30DayPrice,
          has30DaysHistory
        } as any);
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
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden relative">
      {/* Full width header background */}
      <div className="absolute top-0 left-0 right-0 h-[73px] bg-white border-b border-slate-200 z-0" />

      {/* Sidebar Wrapper */}
      <div className="hidden md:flex p-6 pr-2 z-20 relative">
        <div className="relative h-full flex w-64 shrink-0">
          {/* Light gray shadow */}
          <div className="absolute inset-0 bg-slate-200 translate-x-3 translate-y-3 rounded-2xl"></div>
          {/* Egger Red accent */}
          <div className="absolute inset-0 bg-[#DC2B3C] translate-x-1.5 translate-y-1.5 rounded-2xl"></div>
          
          <aside className="relative w-full bg-slate-900 text-slate-300 flex flex-col rounded-2xl overflow-hidden z-10 shadow-2xl border border-slate-800">
            <div className="p-8 bg-slate-950 flex flex-col items-center justify-center gap-4 overflow-hidden text-center">
              <img src="https://cdn.egger.com/img/cms/ff58d5b2-cb11-41dc-ba72-5cec737f1c8a/def606a7-b410-40af-bc8a-34a5e12bf3ca/ORIGINAL/gen_egger_logo_de.svg" alt="EGGER" className="h-8 md:h-10 brightness-0 invert shrink-0 w-auto" />
              <span className="font-bold text-white tracking-widest uppercase whitespace-nowrap text-[8px] sm:text-[10px] md:text-xs w-full truncate border-t border-slate-800 pt-3">E-Com Dashboard</span>
            </div>
            
            <div className="flex-1 overflow-y-auto py-4">
              <div className="px-5 mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Discount Tracking</p>
              </div>
              <nav className="space-y-1 px-3">
                <button 
                  onClick={() => setActiveTab('omnibus')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'omnibus' ? 'bg-[#DC2B3C] text-white' : 'hover:bg-slate-800 hover:text-white'}`}
                >
                  <TrendingDown className="w-4 h-4" />
                  Omnibus tracking
                </button>
                <button 
                  onClick={() => setActiveTab('discount-overview')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'discount-overview' ? 'bg-[#DC2B3C] text-white' : 'hover:bg-slate-800 hover:text-white'}`}
                >
                  <Percent className="w-4 h-4" />
                  Discount overview
                </button>
              </nav>

              <div className="px-5 mt-8 mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Market Analysis</p>
              </div>
              <nav className="space-y-1 px-3">
                <button 
                  onClick={() => setActiveTab('competitors')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'competitors' ? 'bg-[#DC2B3C] text-white' : 'hover:bg-slate-800 hover:text-white'}`}
                >
                  <Users className="w-4 h-4" />
                  Competitors
                </button>
              </nav>
            </div>
            
            <div className="p-4 border-t border-slate-800">
              <button 
                onClick={() => setActiveTab('upload')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'upload' ? 'bg-[#DC2B3C] text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Settings2 className="w-4 h-4" />
                Products Upload
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <header className="shrink-0 h-[73px]">
          <div className="px-4 sm:px-6 lg:px-8 h-full flex justify-between items-center">
            <h2 className="text-xl font-semibold text-slate-800 tracking-tight">
              {activeTab === 'omnibus' && 'Omnibus tracking'}
              {activeTab === 'discount-overview' && 'Discount overview'}
              {activeTab === 'competitors' && 'Competitors'}
              {activeTab === 'upload' && 'Products Upload'}
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
          ) : activeTab === 'upload' ? (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Box className="w-5 h-5 text-blue-500" />
                  Produkte hochladen (CSV oder Manuell)
                </h3>
                <p className="text-sm text-slate-500 mb-6">Pflichtfelder sind <strong>Link</strong> und <strong>Marktplatz</strong>. Die restlichen Daten werden bei der automatischen Erfassung durch den Crawler nachträglich ergänzt.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* CSV Upload Section */}
                  <div className="flex flex-col gap-4">
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer bg-white h-full">
                      <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                        <CopyPlus className="w-6 h-6" />
                      </div>
                      <p className="font-medium text-slate-700 mb-1">CSV-Datei hochladen</p>
                      <p className="text-sm text-slate-500 mb-4">Ziehen Sie Ihre Datei hierher oder klicken Sie hier</p>
                      <button className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-md text-sm font-medium hover:bg-slate-50 mb-2">
                        Datei auswählen
                      </button>
                      <p className="text-xs text-slate-400 mt-2">Erforderliche Spalten: Link, Marktplatz</p>
                    </div>
                    <button 
                      onClick={() => {
                        const csvContent = "data:text/csv;charset=utf-8,Link,Marktplatz\nhttps://www.beispiel.de/produkt,Hornbach\n";
                        const encodedUri = encodeURI(csvContent);
                        const link = document.createElement("a");
                        link.setAttribute("href", encodedUri);
                        link.setAttribute("download", "produkt_upload_template.csv");
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="w-full px-4 py-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-sm font-medium hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Beispiel-CSV herunterladen
                    </button>
                  </div>

                  {/* Manual Entry Section */}
                  <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                    <h4 className="font-medium text-slate-700 mb-4">Manuelle Eingabe</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Marktplatz *</label>
                        <select className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                          <option>Hornbach</option>
                          <option>OBI</option>
                          <option>Bauhaus</option>
                          <option>Toom</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Produkt-Link *</label>
                        <input type="text" placeholder="https://..." className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      </div>
                      <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
                        Produkt hinzufügen
                      </button>
                    </div>
                  </div>
                </div>
              </div>
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
                    <div className="relative">
                      <button 
                        onClick={() => setShowColMenu(!showColMenu)}
                        className="flex items-center gap-2 border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white font-medium hover:bg-slate-50 text-slate-700"
                      >
                        <Columns className="w-4 h-4" />
                        Spalten
                      </button>
                      {showColMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowColMenu(false)} />
                          <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-md shadow-lg py-1 z-50">
                            {Object.keys(visibleCols).map(key => {
                               let label = key;
                               if(key === 'erfasst') label = 'Hinzugefügt am';
                               if(key === 'name') label = 'Artikelname';
                               if(key === 'marketplace') label = 'Marktplatz';
                               if(key === 'regularPrice') label = 'Reg. Preis';
                               if(key === 'currentPrice') label = 'Verkaufspreis';
                               if(key === 'discount') label = 'Discount';
                               if(key === 'validSince') label = 'Gültig seit';
                               if(key === 'fazit') label = 'Fazit';
                               if(key === 'graph') label = 'Graph';
                               
                               return (
                                <label key={key} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer select-none">
                                  <input 
                                    type="checkbox" 
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    checked={visibleCols[key]}
                                    onChange={(e) => setVisibleCols(p => ({ ...p, [key]: e.target.checked }))}
                                  />
                                  {label}
                                </label>
                               )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
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
                  <table className="w-full divide-y divide-slate-200 table-fixed">
                    <thead className="bg-slate-50">
                  <tr>
                    {visibleCols.erfasst && (
                    <th scope="col" className="px-4 py-4 text-left align-top relative group/th2" style={{ width: colWidths['erfasst'] || 120 }}>
                      <div className="flex flex-col h-16 justify-between items-start">
                        <button onClick={() => handleSort('erfasst')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none whitespace-nowrap">Hinzugefügt am {getSortIcon('erfasst')}</button>
                      </div>
                      <div onMouseDown={(e) => startResize('erfasst', e)} className="absolute right-0 top-0 bottom-0 w-1 bg-slate-200/50 cursor-col-resize hover:bg-blue-400 z-10" />
                    </th>
                    )}
                    {visibleCols.name && (
                    <th scope="col" className="px-4 py-4 text-left align-top relative group/th2" style={{ width: colWidths['name'] || 200 }}>
                      <div className="flex flex-col h-16 justify-between items-start w-full pr-2">
                        <button onClick={() => handleSort('name')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none whitespace-nowrap">Artikelname {getSortIcon('name')}</button>
                        <input type="text" placeholder="Suche..." className="w-full text-xs border border-slate-300 rounded px-2 py-1 shadow-sm font-normal" value={columnFilters.name} onChange={e => updateColumnFilter('name', e.target.value)} />
                      </div>
                      <div onMouseDown={(e) => startResize('name', e)} className="absolute right-0 top-0 bottom-0 w-1 bg-slate-200/50 cursor-col-resize hover:bg-blue-400 z-10" />
                    </th>
                    )}
                    {visibleCols.marketplace && (
                    <th scope="col" className="px-4 py-4 text-left align-top relative group/th2" style={{ width: colWidths['marketplace'] || 100 }}>
                      <div className="flex flex-col h-16 justify-between items-start">
                        <button onClick={() => handleSort('marketplace')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none whitespace-nowrap">Marktplatz {getSortIcon('marketplace')}</button>
                      </div>
                      <div onMouseDown={(e) => startResize('marketplace', e)} className="absolute right-0 top-0 bottom-0 w-1 bg-slate-200/50 cursor-col-resize hover:bg-blue-400 z-10" />
                    </th>
                    )}
                    {visibleCols.regularPrice && (
                    <th scope="col" className="px-4 py-4 text-right align-top relative group/th2" style={{ width: colWidths['regularPrice'] || 140 }}>
                      <div className="flex flex-col h-16 justify-between items-end pr-2">
                        <button onClick={() => handleSort('regularPrice')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none whitespace-nowrap">Reg. Preis {getSortIcon('regularPrice')}</button>
                        <div className="flex justify-end gap-1 w-full">
                          <select className="text-xs border border-slate-300 rounded shadow-sm font-normal bg-white w-8 px-0" value={columnFilters.regularPriceOp} onChange={e => updateColumnFilter('regularPriceOp', e.target.value)}>
                            <option value="=">=</option>
                            <option value=">">&gt;</option>
                            <option value="<">&lt;</option>
                          </select>
                          <input type="text" placeholder="Wert" className="w-[calc(100%-2rem)] text-xs border border-slate-300 rounded px-1 py-1 shadow-sm font-normal text-right" value={columnFilters.regularPriceVal} onChange={e => updateColumnFilter('regularPriceVal', e.target.value)} />
                        </div>
                      </div>
                      <div onMouseDown={(e) => startResize('regularPrice', e)} className="absolute right-0 top-0 bottom-0 w-1 bg-slate-200/50 cursor-col-resize hover:bg-blue-400 z-10" />
                    </th>
                    )}
                    {visibleCols.currentPrice && displayedMarketplaces.map(marketplace => (
                      <th key={`th-${marketplace}`} scope="col" className="px-4 py-4 text-right relative group/th2 align-top" style={{ width: colWidths[`currentPrice-${marketplace}`] || 140 }}>
                        <div className="flex flex-col h-16 justify-between items-end pr-2">
                          <button onClick={() => handleSort('currentPrice')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none whitespace-nowrap">Preis ({marketplace}) {getSortIcon('currentPrice')}</button>
                          <div className="flex justify-end gap-1 w-full">
                            <select className="text-xs border border-slate-300 rounded shadow-sm font-normal bg-white w-8 px-0" value={columnFilters.currentPriceOp} onChange={e => updateColumnFilter('currentPriceOp', e.target.value)}>
                              <option value="=">=</option>
                              <option value=">">&gt;</option>
                              <option value="<">&lt;</option>
                            </select>
                            <input type="text" placeholder="Wert" className="w-[calc(100%-2rem)] text-xs border border-slate-300 rounded px-1 py-1 shadow-sm font-normal text-right" value={columnFilters.currentPriceVal} onChange={e => updateColumnFilter('currentPriceVal', e.target.value)} />
                          </div>
                        </div>
                        <div onMouseDown={(e) => startResize(`currentPrice-${marketplace}`, e)} className="absolute right-0 top-0 bottom-0 w-1 bg-slate-200/50 cursor-col-resize hover:bg-blue-400 z-10" />
                      </th>
                    ))}
                    {visibleCols.discount && (
                    <th scope="col" className="px-4 py-4 text-right relative group/th2 align-top" style={{ width: colWidths['discount'] || 120 }}>
                      <div className="flex flex-col h-16 justify-between items-end pr-2">
                        <button onClick={() => handleSort('discount')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none whitespace-nowrap">Discount {getSortIcon('discount')}</button>
                        <div className="flex justify-end gap-1 w-full">
                          <select className="text-xs border border-slate-300 rounded shadow-sm font-normal bg-white w-8 px-0" value={columnFilters.discountOp} onChange={e => updateColumnFilter('discountOp', e.target.value)}>
                            <option value="=">=</option>
                            <option value=">">&gt;</option>
                            <option value="<">&lt;</option>
                          </select>
                          <input type="text" placeholder="%" className="w-[calc(100%-2rem)] text-xs border border-slate-300 rounded px-1 py-1 shadow-sm font-normal text-right" value={columnFilters.discountVal} onChange={e => updateColumnFilter('discountVal', e.target.value)} />
                        </div>
                      </div>
                      <div onMouseDown={(e) => startResize('discount', e)} className="absolute right-0 top-0 bottom-0 w-1 bg-slate-200/50 cursor-col-resize hover:bg-blue-400 z-10" />
                    </th>
                    )}
                    {visibleCols.validSince && (
                    <th scope="col" className="px-4 py-4 text-right relative group/th2 align-top" style={{ width: colWidths['validSince'] || 120 }}>
                      <div className="flex flex-col h-16 justify-between items-end pr-2">
                        <button onClick={() => handleSort('validSince')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none whitespace-nowrap">Gültig seit {getSortIcon('validSince')}</button>
                      </div>
                      <div onMouseDown={(e) => startResize('validSince', e)} className="absolute right-0 top-0 bottom-0 w-1 bg-slate-200/50 cursor-col-resize hover:bg-blue-400 z-10" />
                    </th>
                    )}
                    {visibleCols.fazit && (
                    <th scope="col" className="px-4 py-4 text-center relative group/th2 align-top" style={{ width: colWidths['fazit'] || 120 }}>
                      <div className="flex flex-col h-16 justify-between items-center pr-2">
                        <button onClick={() => handleSort('fazit')} className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center hover:text-slate-900 focus:outline-none whitespace-nowrap">Fazit {getSortIcon('fazit')}</button>
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
                      <div onMouseDown={(e) => startResize('fazit', e)} className="absolute right-0 top-0 bottom-0 w-1 bg-slate-200/50 cursor-col-resize hover:bg-blue-400 z-10" />
                    </th>
                    )}
                    {visibleCols.graph && (
                    <th scope="col" className="px-4 py-4 text-right text-xs font-medium text-slate-500 uppercase tracking-wider align-top relative group/th2" style={{ width: colWidths['graph'] || 64 }}>
                      <div className="flex flex-col h-16 justify-between items-end pr-2">
                        <span>Graph</span>
                      </div>
                      <div onMouseDown={(e) => startResize('graph', e)} className="absolute right-0 top-0 bottom-0 w-1 bg-slate-200/50 cursor-col-resize hover:bg-blue-400 z-10" />
                    </th>
                    )}
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
                        {visibleCols.erfasst && (
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                           {item.history.length > 0 ? new Date(item.history[item.history.length - 1].date || 1715126400000).toLocaleDateString('de-DE') : "-"}
                        </td>
                        )}
                        {visibleCols.name && (
                        <td className="px-4 py-4 text-sm text-slate-900 transition-colors">
                          <div className="flex items-center gap-2 max-w-[200px]">
                            <span className="line-clamp-1 truncate" title={item.name}>
                              {item.name}
                            </span>
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600 shrink-0" title={`Auf ${item.marketplace} ansehen`}>
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </td>
                        )}
                        {visibleCols.marketplace && (
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500 text-left capitalize truncate max-w-[100px]" title={item.marketplace}>
                          {item.marketplace}
                        </td>
                        )}
                        {visibleCols.regularPrice && (
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                          {latest?.strikethroughPrice ? `€ ${latest.strikethroughPrice.toFixed(2)}` : "-"}
                        </td>
                        )}
                        {visibleCols.currentPrice && displayedMarketplaces.map(marketplace => (
                          <td key={`td-${marketplace}`} className="px-4 py-4 whitespace-nowrap text-sm font-medium text-slate-900 text-right">
                            {item.marketplace === marketplace ? (latest ? `€ ${latest.currentPrice.toFixed(2)}` : "-") : "-"}
                          </td>
                        ))}
                        {visibleCols.discount && (
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                          {latest?.discountPercentage ? <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-xs font-medium">-{latest.discountPercentage}%</span> : "-"}
                        </td>
                        )}
                        {visibleCols.validSince && (
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
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
                        )}
                        {visibleCols.fazit && (
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <div className="relative inline-block group/fazit">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-help transition-colors ${latest?.isViolation ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                              {latest?.isViolation ? 'Violation' : 'Compliant'}
                            </span>
                            <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/fazit:block w-64 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl whitespace-normal text-left">
                              <p className="font-medium mb-1 border-b border-slate-700 pb-1">
                                {latest?.isViolation ? '⚠️ Omnibus Violation' : '✅ Omnibus Compliant'}
                              </p>
                              {latest?.strikethroughPrice && latest?.strikethroughPrice > latest.currentPrice ? (
                                <div className="space-y-1 mt-2">
                                  <div className="flex justify-between">
                                    <span className="text-slate-300">Streichpreis:</span>
                                    <span className={latest?.isViolation ? 'text-red-300 font-medium' : ''}>€{latest?.strikethroughPrice?.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-300">Tiefstpreis (30T):</span>
                                    <span className="font-medium">
                                      {item.lowest30DayPrice !== undefined ? `€${item.lowest30DayPrice.toFixed(2)}` : 'Nicht genug Daten'}
                                    </span>
                                  </div>
                                  
                                  {item.has30DaysHistory ? (
                                    <p className="text-[10px] text-slate-400 mt-2 leading-tight">
                                      {latest?.isViolation 
                                        ? "Der angegebene Streichpreis ist höher als der tiefste Preis der letzten 30 Tage. Nach der Omnibus-Richtlinie muss der Streichpreis dem niedrigsten Preis der letzten 30 Tage entsprechen." 
                                        : "Der Streichpreis ist compliant, da er nicht höher ist als der tiefste Preis der letzten 30 Tage vor der Preisreduktion."}
                                    </p>
                                  ) : (
                                    <p className="text-[10px] text-amber-300 mt-2 leading-tight">
                                      Hinweis: Die Preishistorie umfasst weniger als 30 Tage. Ein Verstoß kann deshalb noch nicht abschließend ermittelt werden und wird vorerst als compliant markiert.
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-slate-300 mt-1">Kein Streichpreis hinterlegt oder keine Preisreduktion vorhanden.</p>
                              )}
                              
                              {/* Small triangle arrow at the bottom */}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                            </div>
                          </div>
                        </td>
                        )}
                        {visibleCols.graph && (
                        <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium relative">
                           <div className="relative inline-block">
                              <button onClick={() => setOpenGraphId(item.id)} className="text-slate-400 hover:text-blue-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-blue-50">
                                <TrendingDown className="w-5 h-5" />
                              </button>
                              {openGraphId === item.id && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setOpenGraphId(null)}></div>
                                  <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 w-[600px] bg-white border border-slate-200 rounded-xl shadow-2xl p-5 z-20">
                                    <button onClick={() => setOpenGraphId(null)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 rounded bg-slate-50 hover:bg-slate-100 p-1">
                                      <X className="w-4 h-4" />
                                    </button>
                                    
                                    <div className="flex items-center gap-2 mb-4 pr-8">
                                      <h4 className="text-sm font-semibold text-slate-800 text-left m-0">Preishistorie</h4>
                                      <div className="relative group/info">
                                        <div className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center cursor-help">
                                          <span className="text-[10px] font-bold">i</span>
                                        </div>
                                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover/info:block w-48 bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg text-left z-30">
                                          Dieser Graph zeigt den Verkaufspreis (blau) sowie den Streichpreis (grau) im Zeitverlauf. Die dezent rot hinterlegten Zeiträume markieren einen Verstoß gegen die Omnibus-Richtlinie.
                                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                                        </div>
                                      </div>
                                    </div>

                                    <div className="h-[350px] w-full mt-2">
                                      <ResponsiveContainer width="100%" height="100%">
                                        {(() => {
                                           const chartData = [...item.history].reverse().map(r => ({
                                             date: new Date(r.date || 0).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' }),
                                             price: r.currentPrice,
                                             regular: r.strikethroughPrice,
                                             isViolation: r.isViolation
                                           }));

                                           let maxPrice = 0;
                                           for (const d of chartData) {
                                             if (d.price && d.price > maxPrice) maxPrice = d.price;
                                             if (d.regular && d.regular > maxPrice) maxPrice = d.regular;
                                           }
                                           maxPrice = Math.max(10, Math.ceil(maxPrice / 2) * 2 + 2); 
                                           
                                           const yTicks: number[] = [];
                                           for (let i = 0; i <= maxPrice; i += 2) {
                                             yTicks.push(i);
                                           }

                                           return (
                                            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                              <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={{ strokeWidth: 2, stroke: '#64748b' }} tickLine={false} />
                                              <YAxis domain={[0, maxPrice]} ticks={yTicks} tick={{ fontSize: 10 }} axisLine={{ strokeWidth: 2, stroke: '#64748b' }} tickLine={false} />
                                              
                                              {chartData.map((d, index) => {
                                                if (d.isViolation) {
                                                  const nextPoint = chartData[index + 1];
                                                  if (nextPoint) {
                                                    // @ts-ignore
                                                    return <ReferenceArea key={index} x1={d.date} x2={nextPoint.date} fill="#fee2e2" fillOpacity={0.6} strokeOpacity={0} />;
                                                  } else {
                                                    // @ts-ignore
                                                    return <ReferenceArea key={index} x1={d.date} x2={d.date} fill="#fee2e2" fillOpacity={0.6} strokeOpacity={0} />;
                                                  }
                                                }
                                                return null;
                                              })}

                                              <RechartsTooltip 
                                                contentStyle={{fontSize: '12px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'}} 
                                                formatter={(val: number, name: string) => [`€${val?.toFixed(2) || '-'}`, name === 'price' ? 'Verkaufspreis' : 'Streichpreis']} 
                                                labelStyle={{fontWeight: 'bold', marginBottom: '4px', color: '#334155'}}
                                                itemStyle={{paddingBottom: '2px'}}
                                              />
                                              <Line type="stepAfter" dataKey="regular" stroke="#94a3b8" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} connectNulls />
                                              <Line type="stepAfter" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                                            </LineChart>
                                           );
                                        })()}
                                      </ResponsiveContainer>
                                    </div>
                                    <div className="flex justify-start gap-4 items-center text-[10px] text-slate-500 mt-3 px-2">
                                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Verkaufspreis</div>
                                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400"></span>Streichpreis</div>
                                    </div>
                                  </div>
                                </>
                              )}
                           </div>
                        </td>
                        )}
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
                      <th scope="col" className="px-4 py-4 text-left w-20 text-xs font-medium text-slate-500 uppercase tracking-wider">Lfd. Nr.</th>
                      <th scope="col" className="px-4 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Artikelname</th>
                      {marketplaces.map(marketplace => (
                        <th key={marketplace} scope="col" className="px-4 py-4 text-center text-xs font-medium text-slate-500 uppercase tracking-wider capitalize">{marketplace}</th>
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
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-4 text-sm font-medium text-slate-900 border-r border-slate-100">
                          <div className="line-clamp-1 truncate max-w-[300px]" title={group.name}>{group.name}</div>
                        </td>
                        {marketplaces.map(marketplace => {
                          const mData = group.marketplaces[marketplace];
                          return (
                            <td key={marketplace} className="px-4 py-4 whitespace-nowrap border-r border-slate-100 text-center">
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
