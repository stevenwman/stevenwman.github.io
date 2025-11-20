# Monkey-patch jekyll-scholar Utilities#details_path_for to avoid calling
# Jekyll::Utils.slugify on empty strings (which emits "Empty `slug` generated"
# warnings). This keeps behavior identical except we skip slugify when the
# field value is blank.

module Jekyll
  class Scholar
    module Utilities
      def details_path_for(entry)
        # Expand the details_permalink template into the complete URL for this entry.

        # First generate placeholders for all items in the bibtex entry
        url_placeholders = {}
        entry.fields.each_pair do |k, v|
          value = v.to_s.dup
          # Only slugify non-empty values (and skip doi as original did)
          if k == :doi || k == 'doi'
            value = v.to_s.dup
          else
            if value.nil? || value.strip == ''
              value = ''
            else
              value = Jekyll::Utils.slugify(value, :mode => 'pretty')
            end
          end
          url_placeholders[k] = value
        end

        # Maintain the same URLs as previous versions of jekyll-scholar
        # by replicating the way that it processed the key.
        url_placeholders[:key] = entry.key.to_s.gsub(/[:\s]+/, '_')
        url_placeholders[:details_dir] = details_path

        # Autodetect the appropriate file extension based upon the site config,
        # using the same rules as previous versions of jekyll-scholar. Users can
        # override these settings by defining a details_permalink
        # without the :extension field.
        if (site.config['permalink'] == 'pretty') || (site.config['permalink'].end_with? '/')
          url_placeholders[:extension] = '/'
        else
          url_placeholders[:extension] = '.html'
        end

        # Overwrite 'doi' key with the citation key if DOI field is empty or missing
        if !entry.has_field?('doi') || entry.doi.empty?
          url_placeholders[:doi] = url_placeholders[:key]
        end

        # Now expand the details_permalink template using the placeholders we built
        tmpl = (config['details_permalink'] || '').dup
        url_placeholders.each do |k, v|
          tmpl.gsub!(/:\b#{k}\b/, v.to_s)
        end

        tmpl
      end
    end
  end
end
