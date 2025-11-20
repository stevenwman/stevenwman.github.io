require 'feedjira'
require 'httparty'
require 'jekyll'
require 'nokogiri'
require 'time'

module ExternalPosts
  class ExternalPostsGenerator < Jekyll::Generator
    safe true
    priority :high

    def generate(site)
      if site.config['external_sources'] != nil
        site.config['external_sources'].each do |src|
          puts "Fetching external posts from #{src['name']}:"
          if src['rss_url']
            fetch_from_rss(site, src)
          elsif src['posts']
            fetch_from_urls(site, src)
          end
        end
      end
    end

    def fetch_from_rss(site, src)
      # Fetch RSS with a browser-like User-Agent and check status before parsing
      response = HTTParty.get(src['rss_url'], headers: { 'User-Agent' => 'Mozilla/5.0 (compatible; Jekyll/ExternalPosts)' })
      if response.nil? || response.code != 200
        puts "  Warning: could not fetch RSS for #{src['name']} (HTTP #{response&.code || 'nil'})"
        return
      end

      xml = response.body
      begin
        feed = Feedjira.parse(xml)
      rescue Feedjira::NoParserAvailable => e
        puts "  Warning: feed for #{src['name']} could not be parsed: #{e.message}"
        return
      rescue => e
        puts "  Warning: unexpected error parsing feed for #{src['name']}: #{e.class}: #{e.message}"
        return
      end

      if feed && feed.respond_to?(:entries)
        process_entries(site, src, feed.entries)
      else
        puts "  Warning: no entries found in feed for #{src['name']}"
      end
    end

    def process_entries(site, src, entries)
      entries.each do |e|
        puts "...fetching #{e.url}"
        create_document(site, src['name'], e.url, {
          title: e.title,
          content: e.content,
          summary: e.summary,
          published: e.published
        })
      end
    end

    def create_document(site, source_name, url, content)
      # check if title is composed only of whitespace or foreign characters
      # Build a slug; prefer a sanitized title but fall back to source+url segment
      title_text = content[:title].to_s
      if title_text.gsub(/[^\w]/, '').strip.empty?
        # use the source name and last url segment as fallback
        slug = "#{source_name.downcase.strip.gsub(' ', '-').gsub(/[^\w-]/, '')}-#{url.split('/').last}"
        fallback_title = "#{source_name} #{url.split('/').last}"
      else
        # parse title from the post or use the source name and last url segment as fallback
        slug = title_text.downcase.strip.gsub(' ', '-').gsub(/[^\w-]/, '')
        if slug.empty?
          slug = "#{source_name.downcase.strip.gsub(' ', '-').gsub(/[^\w-]/, '')}-#{url.split('/').last}"
          fallback_title = "#{source_name} #{url.split('/').last}"
        end
      end

      path = site.in_source_dir("_posts/#{slug}.md")
      doc = Jekyll::Document.new(
        path, { :site => site, :collection => site.collections['posts'] }
      )
      doc.data['external_source'] = source_name
  # Ensure the document always has a non-empty title to avoid empty-slug warnings
  doc.data['title'] = (content[:title].to_s.strip.empty? ? (fallback_title || content[:title].to_s) : content[:title])
      doc.data['feed_content'] = content[:content]
      doc.data['description'] = content[:summary]
      doc.data['date'] = content[:published]
      doc.data['redirect'] = url
      doc.content = content[:content]
      site.collections['posts'].docs << doc
    end

    def fetch_from_urls(site, src)
      src['posts'].each do |post|
        puts "...fetching #{post['url']}"
        content = fetch_content_from_url(post['url'])
        content[:published] = parse_published_date(post['published_date'])
        create_document(site, src['name'], post['url'], content)
      end
    end

    def parse_published_date(published_date)
      case published_date
      when String
        Time.parse(published_date).utc
      when Date
        published_date.to_time.utc
      else
        raise "Invalid date format for #{published_date}"
      end
    end

    def fetch_content_from_url(url)
      html = HTTParty.get(url).body
      parsed_html = Nokogiri::HTML(html)

      title = parsed_html.at('head title')&.text.strip || ''
      description = parsed_html.at('head meta[name="description"]')&.attr('content')
      description ||= parsed_html.at('head meta[name="og:description"]')&.attr('content')
      description ||= parsed_html.at('head meta[property="og:description"]')&.attr('content')

      body_content = parsed_html.search('p').map { |e| e.text }
      body_content = body_content.join() || ''

      {
        title: title,
        content: body_content,
        summary: description
        # Note: The published date is now added in the fetch_from_urls method.
      }
    end

  end
end
