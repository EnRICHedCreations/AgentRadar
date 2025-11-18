from http.server import BaseHTTPRequestHandler
import json
from homeharvest import scrape_property
from datetime import datetime
import traceback

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Get request body
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            zip_code = data.get('zipCode')
            property_type = data.get('propertyType', 'residential')
            tag_filters = data.get('tagFilters', [])
            tag_match_type = data.get('tagMatchType', 'any')
            tag_exclude = data.get('tagExclude', [])

            if not zip_code:
                self.send_error(400, "ZIP code is required")
                return

            print(f"Scraping ZIP code: {zip_code}")
            print(f"Property type: {property_type}")
            if tag_filters:
                print(f"Tag filters: {tag_filters} (match type: {tag_match_type})")
            if tag_exclude:
                print(f"Excluding tags: {tag_exclude}")

            # Set property type filter based on selection
            if property_type == 'land':
                # For land, use land-specific tags
                if not tag_filters:
                    tag_filters = ['land', 'lot', 'acreage']
                    tag_match_type = 'any'
                    print(f"Land search - applying tags: {tag_filters}")

            # Scrape properties with tag filtering
            properties = scrape_property(
                location=zip_code,
                listing_type="for_sale",
                past_days=365,  # Get last year of listings
                mls_only=True,  # Only MLS listings have agent info
                tag_filters=tag_filters if tag_filters else None,
                tag_match_type=tag_match_type,
                tag_exclude=tag_exclude if tag_exclude else None
            )

            # Convert to dict
            props_list = properties.to_dict('records')

            print(f"Found {len(props_list)} total properties")

            # Filter out pending sales - only show active listings
            active_props = [
                p for p in props_list
                if p.get('status') and p.get('status').lower() not in ['pending', 'contingent', 'pending_continue_to_show']
            ]

            print(f"Found {len(active_props)} active properties (excluded pending sales)")

            # Filter for stale listings (90+ days)
            stale_props = [
                p for p in active_props
                if p.get('days_on_mls') and p.get('days_on_mls') >= 90
            ]

            print(f"Found {len(stale_props)} stale properties")

            # Debug: Log available fields in first property
            if stale_props:
                print(f"Sample property fields: {list(stale_props[0].keys())}")
                first_prop = stale_props[0]
                print(f"Agent phone fields - agent_phone: {first_prop.get('agent_phone')}, agent_primary_phone: {first_prop.get('agent_primary_phone')}, primary_phone: {first_prop.get('primary_phone')}")

            # Group by agent
            agents_map = {}

            for prop in stale_props:
                agent_email = prop.get('agent_email')

                if not agent_email:
                    continue

                if agent_email not in agents_map:
                    # Try multiple phone field names
                    agent_phone_raw = (
                        prop.get('agent_phone') or
                        prop.get('agent_primary_phone') or
                        prop.get('primary_phone') or
                        prop.get('agent_phones')
                    )

                    # Handle phone number if it's an object (e.g., {ext, primary, type, number})
                    agent_phone = None
                    if agent_phone_raw:
                        if isinstance(agent_phone_raw, dict):
                            # Extract 'number' or 'primary' field from phone object
                            agent_phone = agent_phone_raw.get('number') or agent_phone_raw.get('primary')
                        else:
                            agent_phone = str(agent_phone_raw)

                    agents_map[agent_email] = {
                        'agent_name': prop.get('agent_name') or 'Unknown',
                        'agent_email': agent_email,
                        'agent_phone': agent_phone,
                        'broker_name': prop.get('broker_name'),
                        'office_name': prop.get('office_name'),
                        'office_phone': prop.get('office_phone'),
                        'stale_listings': []
                    }
                else:
                    # Update phone if we found one and didn't have one before
                    if not agents_map[agent_email]['agent_phone']:
                        agent_phone_raw = (
                            prop.get('agent_phone') or
                            prop.get('agent_primary_phone') or
                            prop.get('primary_phone') or
                            prop.get('agent_phones')
                        )

                        # Handle phone number if it's an object
                        if agent_phone_raw:
                            if isinstance(agent_phone_raw, dict):
                                agent_phone = agent_phone_raw.get('number') or agent_phone_raw.get('primary')
                            else:
                                agent_phone = str(agent_phone_raw)

                            if agent_phone:
                                agents_map[agent_email]['agent_phone'] = agent_phone

                # Add property to agent's listings
                agents_map[agent_email]['stale_listings'].append({
                    'address': f"{prop.get('street', '')}, {prop.get('city', '')}, {prop.get('state', '')} {prop.get('zip_code', '')}".strip(),
                    'list_price': prop.get('list_price'),
                    'days_on_mls': prop.get('days_on_mls'),
                    'beds': prop.get('beds'),
                    'baths': prop.get('full_baths'),
                    'sqft': prop.get('sqft'),
                    'property_url': prop.get('property_url'),
                    'tags': prop.get('tags', [])
                })

            # Calculate frustration score for each agent
            agents_list = []

            for agent_data in agents_map.values():
                stale_count = len(agent_data['stale_listings'])

                if stale_count == 0:
                    continue

                # Calculate average days on market
                total_dom = sum(l['days_on_mls'] for l in agent_data['stale_listings'])
                avg_dom = total_dom / stale_count

                # Frustration Score Algorithm:
                # Base: 10 points per stale listing (max 50 points)
                # + 0.25 points per average day on market (max 50 points)
                # Result: 0-100 scale

                listing_score = min(50, stale_count * 10)
                dom_score = min(50, avg_dom * 0.25)
                frustration_score = int(listing_score + dom_score)

                agents_list.append({
                    'agent_name': agent_data['agent_name'],
                    'agent_email': agent_data['agent_email'],
                    'agent_phone': agent_data['agent_phone'] or 'N/A',
                    'broker_name': agent_data['broker_name'] or 'N/A',
                    'office_name': agent_data['office_name'] or 'N/A',
                    'office_phone': agent_data['office_phone'] or 'N/A',
                    'stale_listing_count': stale_count,
                    'avg_days_on_market': round(avg_dom, 1),
                    'frustration_score': frustration_score,
                    'listings': agent_data['stale_listings']
                })

            # Sort by frustration score (highest first)
            agents_list.sort(key=lambda x: x['frustration_score'], reverse=True)

            print(f"Found {len(agents_list)} agents with stale listings")

            # Send response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            response = {
                'success': True,
                'zip_code': zip_code,
                'total_properties': len(active_props),
                'stale_properties': len(stale_props),
                'agents': agents_list,
                'scraped_at': datetime.now().isoformat()
            }

            self.wfile.write(json.dumps(response).encode())

        except Exception as e:
            print(f"Error: {str(e)}")
            print(traceback.format_exc())

            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            error_response = {
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }

            self.wfile.write(json.dumps(error_response).encode())
