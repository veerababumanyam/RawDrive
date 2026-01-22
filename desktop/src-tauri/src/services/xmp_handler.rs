//! XMP sidecar file handler for metadata sync.
//! Feature: 029-pro-review-xmp-sync
//! Task: T081
//!
//! Reads and writes XMP sidecar files for syncing ratings, flags, and labels.

use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, Event};
use quick_xml::{Reader, Writer};
use std::fs;
use std::io::Cursor;
use std::path::Path;
use tracing::{error, info};

/// XMP namespaces.
const XMP_NS: &str = "http://ns.adobe.com/xap/1.0/";
const PHOTOSHOP_NS: &str = "http://ns.adobe.com/photoshop/1.0/";
const RDF_NS: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

/// XMP metadata for sync.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct XmpMetadata {
    /// Rating (0-5, where 0 means unrated).
    pub rating: Option<i32>,
    /// Flag status ("pick", "unflagged", "reject").
    pub flag: Option<String>,
    /// Color label (e.g., "Red", "Yellow", "Green", "Blue", "Purple").
    pub color_label: Option<String>,
    /// Original filename (for matching).
    pub original_filename: Option<String>,
}

impl XmpMetadata {
    /// Check if there's any metadata to sync.
    pub fn has_data(&self) -> bool {
        self.rating.is_some() || self.flag.is_some() || self.color_label.is_some()
    }
}

/// Read XMP metadata from a sidecar file.
pub fn read_xmp_file(path: &Path) -> Result<XmpMetadata, XmpError> {
    let content = fs::read_to_string(path).map_err(XmpError::IoError)?;
    parse_xmp(&content)
}

/// Parse XMP metadata from XML string.
pub fn parse_xmp(content: &str) -> Result<XmpMetadata, XmpError> {
    let mut metadata = XmpMetadata::default();
    let mut reader = Reader::from_str(content);
    reader.trim_text(true);

    let mut buf = Vec::new();
    let mut in_description = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                let qname = e.name();
                let name_bytes = qname.as_ref();
                let name = std::str::from_utf8(name_bytes).unwrap_or("");

                // Check for rdf:Description element
                if name.ends_with("Description") {
                    in_description = true;

                    // Check attributes for XMP properties
                    for attr in e.attributes().flatten() {
                        let key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                        let value = std::str::from_utf8(&attr.value).unwrap_or("");

                        match key {
                            "xmp:Rating" => {
                                metadata.rating = value.parse().ok();
                            }
                            "xmp:Label" => {
                                metadata.color_label = Some(value.to_string());
                            }
                            "photoshop:Urgency" => {
                                // Convert Urgency (1-8) to flag
                                if let Ok(urgency) = value.parse::<i32>() {
                                    metadata.flag = Some(urgency_to_flag(urgency));
                                }
                            }
                            _ => {}
                        }
                    }
                }

                // Check for standalone elements
                if in_description {
                    match name {
                        "xmp:Rating" => {
                            // Value will be in text content
                        }
                        "xmp:Label" => {
                            // Value will be in text content
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::Text(e)) => {
                // Handle text content for elements
                let _text = e.unescape().unwrap_or_default();
            }
            Ok(Event::End(ref e)) => {
                let qname = e.name();
                let name_bytes = qname.as_ref();
                let name = std::str::from_utf8(name_bytes).unwrap_or("");
                if name.ends_with("Description") {
                    in_description = false;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                error!("XMP parsing error: {}", e);
                return Err(XmpError::ParseError(e.to_string()));
            }
            _ => {}
        }
        buf.clear();
    }

    Ok(metadata)
}

/// Write XMP metadata to a sidecar file.
pub fn write_xmp_file(path: &Path, metadata: &XmpMetadata) -> Result<(), XmpError> {
    let content = generate_xmp(metadata)?;
    fs::write(path, content).map_err(XmpError::IoError)?;
    info!("Wrote XMP file: {:?}", path);
    Ok(())
}

/// Generate XMP XML from metadata.
pub fn generate_xmp(metadata: &XmpMetadata) -> Result<String, XmpError> {
    let mut writer = Writer::new(Cursor::new(Vec::new()));

    // XML declaration
    writer
        .write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None)))
        .map_err(|e| XmpError::WriteError(e.to_string()))?;

    // Write xpacket begin as raw text
    writer
        .get_mut()
        .get_mut()
        .extend_from_slice(b"\n<?xpacket begin=\"\xef\xbb\xbf\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n");

    // x:xmpmeta
    let mut xmpmeta = BytesStart::new("x:xmpmeta");
    xmpmeta.push_attribute(("xmlns:x", "adobe:ns:meta/"));
    xmpmeta.push_attribute(("x:xmptk", "RawDrive Desktop Sync"));
    writer
        .write_event(Event::Start(xmpmeta))
        .map_err(|e| XmpError::WriteError(e.to_string()))?;

    // rdf:RDF
    let mut rdf = BytesStart::new("rdf:RDF");
    rdf.push_attribute(("xmlns:rdf", RDF_NS));
    rdf.push_attribute(("xmlns:xmp", XMP_NS));
    rdf.push_attribute(("xmlns:photoshop", PHOTOSHOP_NS));
    writer
        .write_event(Event::Start(rdf))
        .map_err(|e| XmpError::WriteError(e.to_string()))?;

    // rdf:Description
    let mut desc = BytesStart::new("rdf:Description");
    desc.push_attribute(("rdf:about", ""));

    // Add metadata as attributes
    if let Some(rating) = metadata.rating {
        desc.push_attribute(("xmp:Rating", rating.to_string().as_str()));
    }

    if let Some(ref label) = metadata.color_label {
        desc.push_attribute(("xmp:Label", label.as_str()));
    }

    if let Some(ref flag) = metadata.flag {
        let urgency = flag_to_urgency(flag);
        desc.push_attribute(("photoshop:Urgency", urgency.to_string().as_str()));
    }

    // Write as empty element if no child content
    writer
        .write_event(Event::Empty(desc))
        .map_err(|e| XmpError::WriteError(e.to_string()))?;

    // Close rdf:RDF
    writer
        .write_event(Event::End(BytesEnd::new("rdf:RDF")))
        .map_err(|e| XmpError::WriteError(e.to_string()))?;

    // Close x:xmpmeta
    writer
        .write_event(Event::End(BytesEnd::new("x:xmpmeta")))
        .map_err(|e| XmpError::WriteError(e.to_string()))?;

    // Write xpacket end as raw text
    writer
        .get_mut()
        .get_mut()
        .extend_from_slice(b"\n<?xpacket end=\"w\"?>\n");

    let result = writer.into_inner().into_inner();
    String::from_utf8(result).map_err(|e| XmpError::WriteError(e.to_string()))
}

/// Convert photoshop:Urgency (1-8) to flag status.
///
/// Lightroom uses:
/// - 1 = Pick (flagged)
/// - 5 = Unflagged
/// - 8 = Reject
fn urgency_to_flag(urgency: i32) -> String {
    match urgency {
        1 => "pick".to_string(),
        8 => "reject".to_string(),
        _ => "unflagged".to_string(),
    }
}

/// Convert flag status to photoshop:Urgency (1-8).
fn flag_to_urgency(flag: &str) -> i32 {
    match flag.to_lowercase().as_str() {
        "pick" | "flagged" => 1,
        "reject" | "rejected" => 8,
        _ => 5, // unflagged
    }
}

/// Merge cloud metadata into existing XMP file.
pub fn merge_metadata(path: &Path, cloud_metadata: &XmpMetadata) -> Result<(), XmpError> {
    let mut local_metadata = if path.exists() {
        read_xmp_file(path)?
    } else {
        XmpMetadata::default()
    };

    // Merge: cloud values take precedence if present
    if cloud_metadata.rating.is_some() {
        local_metadata.rating = cloud_metadata.rating;
    }
    if cloud_metadata.flag.is_some() {
        local_metadata.flag = cloud_metadata.flag.clone();
    }
    if cloud_metadata.color_label.is_some() {
        local_metadata.color_label = cloud_metadata.color_label.clone();
    }

    write_xmp_file(path, &local_metadata)
}

/// Compare two metadata objects and detect conflicts.
#[derive(Debug)]
pub struct MetadataComparison {
    pub rating_conflict: bool,
    pub flag_conflict: bool,
    pub color_label_conflict: bool,
    pub any_conflict: bool,
}

pub fn compare_metadata(local: &XmpMetadata, cloud: &XmpMetadata) -> MetadataComparison {
    let rating_conflict = local.rating.is_some()
        && cloud.rating.is_some()
        && local.rating != cloud.rating;

    let flag_conflict = local.flag.is_some()
        && cloud.flag.is_some()
        && local.flag != cloud.flag;

    let color_label_conflict = local.color_label.is_some()
        && cloud.color_label.is_some()
        && local.color_label != cloud.color_label;

    MetadataComparison {
        rating_conflict,
        flag_conflict,
        color_label_conflict,
        any_conflict: rating_conflict || flag_conflict || color_label_conflict,
    }
}

/// XMP handler errors.
#[derive(Debug, thiserror::Error)]
pub enum XmpError {
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Write error: {0}")]
    WriteError(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_xmp_with_rating() {
        let xmp = r#"<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
           xmlns:xmp="http://ns.adobe.com/xap/1.0/">
    <rdf:Description rdf:about="" xmp:Rating="4"/>
  </rdf:RDF>
</x:xmpmeta>"#;

        let metadata = parse_xmp(xmp).unwrap();
        assert_eq!(metadata.rating, Some(4));
    }

    #[test]
    fn test_parse_xmp_with_label() {
        let xmp = r#"<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
           xmlns:xmp="http://ns.adobe.com/xap/1.0/">
    <rdf:Description rdf:about="" xmp:Label="Red"/>
  </rdf:RDF>
</x:xmpmeta>"#;

        let metadata = parse_xmp(xmp).unwrap();
        assert_eq!(metadata.color_label, Some("Red".to_string()));
    }

    #[test]
    fn test_generate_xmp() {
        let metadata = XmpMetadata {
            rating: Some(5),
            flag: Some("pick".to_string()),
            color_label: Some("Green".to_string()),
            original_filename: None,
        };

        let xmp = generate_xmp(&metadata).unwrap();
        assert!(xmp.contains("xmp:Rating=\"5\""));
        assert!(xmp.contains("xmp:Label=\"Green\""));
        assert!(xmp.contains("photoshop:Urgency=\"1\"")); // pick = 1
    }

    #[test]
    fn test_urgency_conversion() {
        assert_eq!(urgency_to_flag(1), "pick");
        assert_eq!(urgency_to_flag(5), "unflagged");
        assert_eq!(urgency_to_flag(8), "reject");

        assert_eq!(flag_to_urgency("pick"), 1);
        assert_eq!(flag_to_urgency("unflagged"), 5);
        assert_eq!(flag_to_urgency("reject"), 8);
    }

    #[test]
    fn test_compare_metadata_no_conflict() {
        let local = XmpMetadata {
            rating: Some(3),
            ..Default::default()
        };
        let cloud = XmpMetadata {
            rating: Some(3),
            ..Default::default()
        };

        let comparison = compare_metadata(&local, &cloud);
        assert!(!comparison.any_conflict);
    }

    #[test]
    fn test_compare_metadata_with_conflict() {
        let local = XmpMetadata {
            rating: Some(3),
            ..Default::default()
        };
        let cloud = XmpMetadata {
            rating: Some(5),
            ..Default::default()
        };

        let comparison = compare_metadata(&local, &cloud);
        assert!(comparison.rating_conflict);
        assert!(comparison.any_conflict);
    }
}
