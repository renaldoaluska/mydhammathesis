import sys; sys.path.insert(0, "."); import reader; reader.init(); print("an10.27 in map:", "an10.27" in reader._RAW_FILE_MAP or "an10.27" in reader._HTML_FILE_MAP)
