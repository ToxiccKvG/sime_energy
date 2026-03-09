import { useState } from 'react';
import { OCRField } from '@/types/invoice';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageViewerProps {
  pages: string[];
  currentPage: number;
  onPageChange: (page: number) => void;
  boundingBoxes: OCRField[];
  selectedField: string | null;
  hoveredField: string | null;
  onBBoxClick: (fieldName: string) => void;
  onBBoxHover: (fieldName: string | null) => void;
}

export function ImageViewer({
  pages,
  currentPage,
  onPageChange,
  boundingBoxes,
  selectedField,
  hoveredField,
  onBBoxClick,
  onBBoxHover,
}: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [showBBoxes, setShowBBoxes] = useState(true);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const currentPageBBoxes = boundingBoxes.filter(field => field.boundingBox.page === currentPage);

  return (
    <div className="flex h-full flex-col">
      {/* Controls */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleRotate}>
            <RotateCw className="h-4 w-4" />
          </Button>
          <div className="ml-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="showBBoxes"
              checked={showBBoxes}
              onChange={(e) => setShowBBoxes(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="showBBoxes" className="text-sm text-foreground">
              Afficher les bounding boxes
            </label>
          </div>
        </div>

        {pages.length > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-foreground">
              Page {currentPage + 1} / {pages.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(pages.length - 1, currentPage + 1))}
              disabled={currentPage === pages.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Image with bounding boxes */}
      <div className="relative flex-1 overflow-auto rounded-lg border bg-background">
        <div className="flex min-h-full items-center justify-center p-8">
          <div
            className="relative"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s ease',
            }}
          >
            <img
              src={pages[currentPage]}
              alt={`Page ${currentPage + 1}`}
              className="max-w-full"
              style={{ width: '600px' }}
            />
            
            {showBBoxes && currentPageBBoxes.map((field) => {
              const isSelected = selectedField === field.name;
              const isHovered = hoveredField === field.name;
              
              return (
                <div
                  key={field.name}
                  className={cn(
                    'absolute cursor-pointer border-2 transition-all',
                    isSelected && 'border-primary bg-primary/10 ring-2 ring-primary ring-offset-2',
                    isHovered && !isSelected && 'border-primary/50 bg-primary/5',
                    !isSelected && !isHovered && 'border-accent bg-accent/5 hover:border-accent/70'
                  )}
                  style={{
                    left: `${field.boundingBox.x}px`,
                    top: `${field.boundingBox.y}px`,
                    width: `${field.boundingBox.width}px`,
                    height: `${field.boundingBox.height}px`,
                  }}
                  onClick={() => onBBoxClick(field.name)}
                  onMouseEnter={() => onBBoxHover(field.name)}
                  onMouseLeave={() => onBBoxHover(null)}
                  title={`${field.name}: ${field.value} (${Math.round(field.confidence * 100)}%)`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
