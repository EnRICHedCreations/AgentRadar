'use client';

import { useState } from 'react';

interface Agent {
  agent_name: string;
  agent_email: string;
  agent_phone: string;
  broker_name: string;
  office_name: string;
  stale_listing_count: number;
  avg_days_on_market: number;
  frustration_score: number;
  listings: Array<{
    address: string;
    list_price: number;
    days_on_mls: number;
    beds: number;
    baths: number;
    sqft: number;
    property_url?: string;
    tags?: string[];
  }>;
}

interface ScrapeResult {
  success: boolean;
  zip_code: string;
  total_properties: number;
  stale_properties: number;
  agents: Agent[];
  scraped_at: string;
  error?: string;
}

export default function Home() {
  const [zipCode, setZipCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScrapeResult | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [tagExclude, setTagExclude] = useState<string[]>([]);
  const [tagMatchType, setTagMatchType] = useState<'any' | 'all' | 'exact'>('any');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [propertyType, setPropertyType] = useState<'residential' | 'land'>('residential');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!zipCode || zipCode.length !== 5) {
      alert('Please enter a valid 5-digit ZIP code');
      return;
    }

    setLoading(true);
    setResults(null);

    try {
      const response = await fetch('/api/scrape.py', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          zipCode,
          propertyType,
          tagFilters: tagFilters.length > 0 ? tagFilters : undefined,
          tagMatchType,
          tagExclude: tagExclude.length > 0 ? tagExclude : undefined
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResults(data);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!results || results.agents.length === 0) return;

    // Export detailed listings with tags
    const headers = [
      'Agent Name',
      'Agent Email',
      'Agent Phone',
      'Broker',
      'Office',
      'Property Address',
      'List Price',
      'Days on MLS',
      'Beds',
      'Baths',
      'Sqft',
      'Tags',
      'Frustration Score'
    ];

    const rows: string[][] = [];

    results.agents.forEach(agent => {
      agent.listings.forEach(listing => {
        rows.push([
          agent.agent_name,
          agent.agent_email,
          agent.agent_phone,
          agent.broker_name,
          agent.office_name,
          listing.address,
          listing.list_price?.toString() || 'N/A',
          listing.days_on_mls?.toString() || 'N/A',
          listing.beds?.toString() || 'N/A',
          listing.baths?.toString() || 'N/A',
          listing.sqft?.toString() || 'N/A',
          listing.tags?.join('; ') || 'None',
          agent.frustration_score.toString()
        ]);
      });
    });

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frustrated-agents-${results.zip_code}-${Date.now()}.csv`;
    a.click();
  };

  const addTag = (isExclude: boolean = false) => {
    if (!tagInput.trim()) return;

    // Split by comma and process multiple tags
    const tags = tagInput
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);

    if (isExclude) {
      const newTags = tags.filter(tag => !tagExclude.includes(tag));
      if (newTags.length > 0) {
        setTagExclude([...tagExclude, ...newTags]);
      }
    } else {
      const newTags = tags.filter(tag => !tagFilters.includes(tag));
      if (newTags.length > 0) {
        setTagFilters([...tagFilters, ...newTags]);
      }
    }
    setTagInput('');
  };

  const removeTag = (tag: string, isExclude: boolean = false) => {
    if (isExclude) {
      setTagExclude(tagExclude.filter(t => t !== tag));
    } else {
      setTagFilters(tagFilters.filter(t => t !== tag));
    }
  };

  const getFrustrationColor = (score: number) => {
    if (score >= 80) return 'text-red-600 bg-red-100';
    if (score >= 60) return 'text-orange-600 bg-orange-100';
    if (score >= 40) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            AgentRadar
          </h1>
          <p className="text-gray-600">
            Find frustrated real estate agents with stale listings
          </p>
        </div>

        {/* Search Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <form onSubmit={handleSearch}>
            <div className="flex gap-4 items-end mb-4">
              <div className="flex-1">
                <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700 mb-2">
                  ZIP Code
                </label>
                <input
                  type="text"
                  id="zipCode"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  placeholder="Enter 5-digit ZIP code"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={5}
                />
              </div>

              {/* Property Type Selector */}
              <div>
                <label htmlFor="propertyType" className="block text-sm font-medium text-gray-700 mb-1">
                  Property Type
                </label>
                <select
                  id="propertyType"
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value as 'residential' | 'land')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="residential">Residential (Houses)</option>
                  <option value="land">Land (Lots/Acreage)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'Searching...' : 'Find Agents'}
              </button>
            </div>

            {/* Advanced Filters Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {showAdvanced ? '− Hide' : '+ Show'} Advanced Tag Filters
            </button>

            {/* Advanced Tag Filters */}
            {showAdvanced && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Include Tags */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Include Tags (properties must have these)
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(false))}
                        placeholder="e.g., swimming_pool, garage_2_or_more"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => addTag(false)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tagFilters.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag, false)}
                            className="hover:text-blue-900"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    {tagFilters.length > 0 && (
                      <div className="mt-2">
                        <label className="text-xs text-gray-600">Match Type:</label>
                        <select
                          value={tagMatchType}
                          onChange={(e) => setTagMatchType(e.target.value as 'any' | 'all' | 'exact')}
                          className="ml-2 px-2 py-1 border border-gray-300 rounded text-xs"
                        >
                          <option value="any">Any (OR)</option>
                          <option value="all">All (AND)</option>
                          <option value="exact">Exact Match</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Exclude Tags */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Exclude Tags (properties must NOT have these)
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(true))}
                        placeholder="e.g., fixer_upper"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-red-500"
                      />
                      <button
                        type="button"
                        onClick={() => addTag(true)}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tagExclude.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm">
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag, true)}
                            className="hover:text-red-900"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-gray-50 rounded-md">
                  <p className="text-xs text-gray-600">
                    <strong>Common tags:</strong> swimming_pool, garage_2_or_more, fireplace, hardwood_floors, new_construction,
                    energy_efficient, spa_or_hot_tub, big_yard, modern_kitchen, fixer_upper, single_story, two_or_more_stories
                  </p>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Scraping listings and analyzing agents...</p>
            <p className="text-sm text-gray-500">This may take 30-60 seconds</p>
          </div>
        )}

        {/* Results */}
        {results && !loading && (
          <div>
            {/* Stats Bar */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-gray-600">ZIP Code</div>
                  <div className="text-2xl font-bold text-gray-900">{results.zip_code}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Total Properties</div>
                  <div className="text-2xl font-bold text-gray-900">{results.total_properties}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Stale Listings</div>
                  <div className="text-2xl font-bold text-gray-900">{results.stale_properties}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Frustrated Agents</div>
                  <div className="text-2xl font-bold text-gray-900">{results.agents.length}</div>
                </div>
              </div>

              {results.agents.length > 0 && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={exportToCSV}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium text-sm"
                  >
                    Export to CSV
                  </button>
                </div>
              )}
            </div>

            {/* Agents List */}
            {results.agents.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <div className="text-gray-400 text-5xl mb-4">🎉</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No frustrated agents found
                </h3>
                <p className="text-gray-600">
                  There are no agents with stale listings (90+ days) in this ZIP code.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {results.agents.map((agent, index) => (
                  <div key={index} className="bg-white rounded-lg shadow-md overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-bold text-gray-900">
                              {agent.agent_name}
                            </h3>
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getFrustrationColor(agent.frustration_score)}`}>
                              Frustration Score: {agent.frustration_score}
                            </span>
                          </div>

                          <div className="grid md:grid-cols-2 gap-2 text-sm text-gray-600 mb-4">
                            <div>
                              <span className="font-medium">Email:</span>{' '}
                              <a href={`mailto:${agent.agent_email}`} className="text-blue-600 hover:underline">
                                {agent.agent_email}
                              </a>
                            </div>
                            <div>
                              <span className="font-medium">Phone:</span>{' '}
                              <a href={`tel:${agent.agent_phone}`} className="text-blue-600 hover:underline">
                                {agent.agent_phone}
                              </a>
                            </div>
                            <div>
                              <span className="font-medium">Broker:</span> {agent.broker_name}
                            </div>
                            <div>
                              <span className="font-medium">Office:</span> {agent.office_name}
                            </div>
                          </div>

                          <div className="flex gap-6">
                            <div>
                              <div className="text-2xl font-bold text-gray-900">
                                {agent.stale_listing_count}
                              </div>
                              <div className="text-sm text-gray-600">Stale Listings</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-gray-900">
                                {agent.avg_days_on_market}
                              </div>
                              <div className="text-sm text-gray-600">Avg Days on Market</div>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => setExpandedAgent(expandedAgent === agent.agent_email ? null : agent.agent_email)}
                          className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium"
                        >
                          {expandedAgent === agent.agent_email ? 'Hide' : 'View'} Listings
                        </button>
                      </div>

                      {/* Expanded Listings */}
                      {expandedAgent === agent.agent_email && (
                        <div className="mt-4 pt-4 border-t">
                          <h4 className="font-semibold text-gray-900 mb-3">
                            Stale Listings ({agent.listings.length})
                          </h4>
                          <div className="space-y-2">
                            {agent.listings.map((listing, idx) => (
                              <div key={idx} className="bg-gray-50 p-3 rounded-md text-sm">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900">{listing.address}</div>
                                    <div className="text-gray-600">
                                      {listing.beds} bed · {listing.baths} bath · {listing.sqft?.toLocaleString()} sqft
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-gray-900">
                                      ${listing.list_price?.toLocaleString()}
                                    </div>
                                    <div className="text-red-600 font-medium">
                                      {listing.days_on_mls} days
                                    </div>
                                  </div>
                                </div>
                                {listing.property_url && (
                                  <a
                                    href={listing.property_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline text-xs mt-1 inline-block"
                                  >
                                    View on Realtor.com →
                                  </a>
                                )}
                                {listing.tags && listing.tags.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {listing.tags.map((tag, idx) => (
                                      <span
                                        key={idx}
                                        className="inline-block px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs"
                                      >
                                        {tag.replace(/_/g, ' ')}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
